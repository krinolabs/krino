import type { Options } from "@anthropic-ai/claude-agent-sdk";
import type {
  HostCapabilities,
  HostName,
  KrinoRuntime,
  RunHandle,
  ToolDescription,
  ToolSelectionOutcome,
} from "../../contracts/index.js";
import type { AgentRunState } from "./agent-run-state.js";
import { buildDisallowedTools } from "./build-disallowed-tools.js";
import { claudeAgentSdkVersion } from "./host-sdk-version.js";
import { mergeHooks } from "./merge-hooks.js";
import { createKrinoPreToolUseHook } from "./pre-tool-use-hook.js";
import { warnOncePerProcess } from "./warn-once.js";

export const CLAUDE_AGENT_SDK_HOST_NAME: HostName = "claude-agent-sdk";

/** The Agent SDK gives hooks, not the loop: tool selection at run start, usage per run. */
export const CLAUDE_AGENT_SDK_CAPABILITIES: HostCapabilities = {
  supportedDecisions: ["toolSelection", "riskGate"],
  toolSelectionTiming: "runStartOnly",
  reportsPerStepUsage: false,
};

const MISSING_DESCRIPTIONS_WARNING_KEY = "missingToolDescriptions";
const MISSING_DESCRIPTIONS_WARNING =
  "krino: tool selection skipped because no toolDescriptions were passed to " +
  "krinoAgentOptions(). Pass { toolDescriptions } to enable it.";

export type KrinoAgentAdapterOptions = {
  /**
   * The tools krino may decide about, with descriptions for the decision provider. Enforce mode
   * only ever disallows tools in this list. Without it, tool selection is skipped.
   */
  toolDescriptions?: Array<ToolDescription>;
};

export type KrinoAgentRun = {
  /** Pass these to `query()`. */
  queryOptions: Options;
  runHandle: RunHandle;
  /** The run-start (step 0) tool-selection outcome. */
  toolSelection: ToolSelectionOutcome;
};

const agentRunStates = new WeakMap<KrinoAgentRun, AgentRunState>();

/** The state the hook and the observer share; `undefined` for objects krino did not create. */
export function findAgentRunState(krinoRun: KrinoAgentRun): AgentRunState | undefined {
  return agentRunStates.get(krinoRun);
}

/** Valid descriptions, first one wins per tool name. A `Map`: tool names come from outside. */
function uniqueToolDescriptions(
  toolDescriptions: ReadonlyArray<ToolDescription> | undefined,
): Array<ToolDescription> {
  const descriptionsByToolName = new Map<string, ToolDescription>();
  for (const toolDescription of toolDescriptions ?? []) {
    if (typeof toolDescription?.toolName !== "string" || toolDescription.toolName === "") {
      continue;
    }
    if (!descriptionsByToolName.has(toolDescription.toolName)) {
      descriptionsByToolName.set(toolDescription.toolName, {
        toolName: toolDescription.toolName,
        toolDescription:
          typeof toolDescription.toolDescription === "string"
            ? toolDescription.toolDescription
            : toolDescription.toolName,
      });
    }
  }
  return [...descriptionsByToolName.values()];
}

/**
 * Starts a krino run and returns the options to pass to `query()`.
 *
 * - Run start is step 0: tool selection is decided once, here.
 * - Enforce mode prunes with `disallowedTools` only: the user's entries plus the known tools that
 *   were not suggested. `allowedTools` is never read or changed. Shadow mode, a timeout, a failure,
 *   low confidence or an exploration sample leave tool availability unchanged.
 * - Adds a `PreToolUse` hook that checks each tool call's risk. The user's hooks keep their order;
 *   krino's matcher comes last. In shadow mode krino's hook never changes the hook decision.
 */
export async function krinoAgentOptions(
  queryOptions: Options,
  krinoRuntime: KrinoRuntime,
  taskText: string,
  adapterOptions: KrinoAgentAdapterOptions = {},
): Promise<KrinoAgentRun> {
  const hostSdkVersion = await claudeAgentSdkVersion();
  const runHandle = krinoRuntime.startRun({
    hostName: CLAUDE_AGENT_SDK_HOST_NAME,
    hostSdkVersion,
    capabilities: CLAUDE_AGENT_SDK_CAPABILITIES,
  });

  if (adapterOptions.toolDescriptions === undefined) {
    // The adapter cannot see the decision mode, so it skips in every mode: an empty tool list
    // makes the runtime record `skippedUnsupported` without asking or waiting.
    warnOncePerProcess(MISSING_DESCRIPTIONS_WARNING_KEY, MISSING_DESCRIPTIONS_WARNING);
  }
  const availableTools = uniqueToolDescriptions(adapterOptions.toolDescriptions);
  const availableToolNames = availableTools.map((toolDescription) => toolDescription.toolName);

  const decisionStartedAt = performance.now();
  const toolSelection = await runHandle.decideToolSelection({
    runIdentifier: runHandle.runIdentifier,
    stepNumber: 0,
    taskText,
    availableTools,
    recentMessagesText: "",
  });
  const toolSelectionLatencyInMilliseconds = Math.round(performance.now() - decisionStartedAt);

  const runState: AgentRunState = {
    hostSdkVersion,
    requestedModelIdentifier:
      typeof queryOptions.model === "string" && queryOptions.model !== ""
        ? queryOptions.model
        : null,
    availableToolNames,
    toolSelectionLatencyInMilliseconds,
    toolCallCount: 0,
    toolCallSteps: [],
    usedToolNames: new Set(),
    finishPromise: null,
  };
  const resultOptions: Options = {
    ...queryOptions,
    hooks: mergeHooks(queryOptions.hooks, {
      hooks: [createKrinoPreToolUseHook(runHandle, runState)],
    }),
  };
  if (toolSelection.decisionRecord.decisionMode === "enforce") {
    const userDisallowedTools = queryOptions.disallowedTools;
    const disallowedTools = buildDisallowedTools({
      userDisallowedTools,
      knownToolNames: availableToolNames,
      suggestedToolNames: toolSelection.toolNamesToSend,
    });
    if (disallowedTools.length > (userDisallowedTools?.length ?? 0)) {
      resultOptions.disallowedTools = disallowedTools;
    }
  }

  const krinoRun: KrinoAgentRun = { queryOptions: resultOptions, runHandle, toolSelection };
  agentRunStates.set(krinoRun, runState);
  return krinoRun;
}
