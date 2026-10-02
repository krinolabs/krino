import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { StepTraceInput } from "../../contracts/index.js";
import type { AgentRunState } from "./agent-run-state.js";
import {
  CLAUDE_AGENT_SDK_HOST_NAME,
  findAgentRunState,
  type KrinoAgentRun,
} from "./krino-agent-options.js";
import { mainModelIdentifier, totalTokenUsageFrom } from "./run-usage.js";
import { warnOncePerProcess } from "./warn-once.js";

const UNKNOWN_MODEL_IDENTIFIER = "unknown";

const FOREIGN_RUN_WARNING_KEY = "foreignRun";
const FOREIGN_RUN_WARNING =
  "krino: observeKrinoMessages() got a run that krinoAgentOptions() did not return; " +
  "nothing is recorded. Pass the object krinoAgentOptions() resolved to.";

/** The fields krino reads from a `result` message. */
type RunResult = {
  modelUsage: unknown;
  totalCostInUsd: number;
  turnCount: number | null;
};

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function runResultFrom(message: SDKMessage): RunResult | null {
  if (message.type !== "result") {
    return null;
  }
  return {
    modelUsage: message.modelUsage,
    totalCostInUsd: finiteOrNull(message.total_cost_usd) ?? 0,
    turnCount: finiteOrNull(message.num_turns),
  };
}

/** Writes step 0, one step per tool call, and the run summary. Runs once per run. */
async function finishAgentRun(
  krinoRun: KrinoAgentRun,
  runState: AgentRunState,
  lastResult: RunResult | null,
): Promise<void> {
  const { runHandle, toolSelection } = krinoRun;
  const modelIdentifier =
    mainModelIdentifier(runState.requestedModelIdentifier, lastResult?.modelUsage) ??
    UNKNOWN_MODEL_IDENTIFIER;
  const sharedStepFields = {
    runIdentifier: runHandle.runIdentifier,
    hostName: CLAUDE_AGENT_SDK_HOST_NAME,
    hostSdkVersion: runState.hostSdkVersion,
    modelIdentifier,
    availableToolNames: [...runState.availableToolNames],
    // The Agent SDK reports usage per run only.
    tokenUsage: null,
    costInUsd: null,
    contentHash: null,
  } satisfies Partial<StepTraceInput>;

  runHandle.recordStep({
    ...sharedStepFields,
    stepNumber: 0,
    chosenToolNames: [],
    latencyInMilliseconds: runState.toolSelectionLatencyInMilliseconds,
    decisions: [toolSelection.decisionRecord],
  });
  const toolCallSteps = [...runState.toolCallSteps].sort(
    (firstStep, secondStep) => firstStep.stepNumber - secondStep.stepNumber,
  );
  for (const toolCallStep of toolCallSteps) {
    runHandle.recordStep({
      ...sharedStepFields,
      stepNumber: toolCallStep.stepNumber,
      chosenToolNames: [toolCallStep.toolName],
      latencyInMilliseconds: null,
      decisions: [toolCallStep.riskDecisionRecord],
    });
  }

  await runHandle.finishRun({
    runIdentifier: runHandle.runIdentifier,
    hostName: CLAUDE_AGENT_SDK_HOST_NAME,
    hostSdkVersion: runState.hostSdkVersion,
    modelIdentifier,
    totalTokenUsage: totalTokenUsageFrom(lastResult?.modelUsage),
    totalCostInUsd: lastResult?.totalCostInUsd ?? 0,
    stepCount: lastResult?.turnCount ?? runState.toolCallCount,
    usedToolNames: [...runState.usedToolNames].sort(),
    // The runtime fills it from the settled step-0 suggestion: shadow suggestions settle in the
    // background, where the adapter cannot see them.
    toolSelectionAgreement: null,
  });
}

function finishAgentRunOnce(
  krinoRun: KrinoAgentRun,
  runState: AgentRunState,
  lastResult: RunResult | null,
): Promise<void> {
  runState.finishPromise ??= finishAgentRun(krinoRun, runState, lastResult).catch(
    (unexpectedError: unknown) => {
      console.warn(`krino: failed to finish the Claude Agent SDK run: ${String(unexpectedError)}`);
    },
  );
  return runState.finishPromise;
}

/**
 * Passes every message of a `query()` stream through unchanged. When the stream ends (finished,
 * thrown, or left early with `break`), it records the run: usage and cost from the last `result`
 * message (cumulative), then `finishRun`. The host's own stream errors are rethrown; krino's never.
 */
export async function* observeKrinoMessages<Message extends SDKMessage>(
  messageStream: AsyncIterable<Message>,
  krinoRun: KrinoAgentRun,
): AsyncGenerator<Message, void, undefined> {
  const runState = findAgentRunState(krinoRun);
  if (runState === undefined) {
    warnOncePerProcess(FOREIGN_RUN_WARNING_KEY, FOREIGN_RUN_WARNING);
    yield* messageStream;
    return;
  }

  let lastResult: RunResult | null = null;
  try {
    for await (const message of messageStream) {
      lastResult = runResultFrom(message) ?? lastResult;
      yield message;
    }
  } finally {
    await finishAgentRunOnce(krinoRun, runState, lastResult);
  }
}
