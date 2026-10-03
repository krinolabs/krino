import type {
  HookJSONOutput,
  ModelUsage,
  Options,
  PreToolUseHookInput,
  SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { estimateCatalogSize, executeMockTool, findMockTool } from "@krinolabs/bench";
import { toCallToolResult, toClaudeAgentSdkToolName } from "@krinolabs/bench/claude-agent-sdk";
import {
  costFromUsage,
  createFakeDecisionProvider,
  DEFAULT_MODEL_PRICES,
  type FakeAnswerFunction,
  findModelPrice,
} from "@krinolabs/krino";
import {
  LIVE_MODEL_IDENTIFIER,
  LOG_TRIAGE_TOOL_NAMES,
  selectLogTriageToolNames,
  type ToolCount,
} from "./log-triage.js";
import { type LogTriageResult, runLogTriage, type StartAgent } from "./run-log-triage.js";

// --fake: a scripted Claude Agent SDK message stream stands in for `query()`, the same approach
// as krino's adapter tests. It runs krino's PreToolUse hook before each tool call, as the SDK
// would, and the bench executors for the results. Nothing calls the SDK, the Claude Code
// process or any API. Everything it prints is labelled "simulated".

export const SIMULATED_LABEL = "[simulated]";

const SESSION_ID = "simulated-session";

type ScriptedToolCall = { toolName: string; toolInput: Record<string, string> };

const SCRIPTED_TOOL_CALLS: ReadonlyArray<ScriptedToolCall> = [
  { toolName: "get_request_trace", toolInput: { requestId: "REQ-7f3a" } },
  {
    toolName: "search_application_logs",
    toolInput: {
      serviceName: "payment-service",
      query: "REQ-7f3a",
      startTime: "2026-10-01T10:00:00Z",
      endTime: "2026-10-01T10:15:00Z",
    },
  },
];

const SCRIPTED_ANSWER =
  "REQ-7f3a failed in payment-service: the card was declined (do_not_honor), and " +
  "checkout-service passed the error on. No service is down; ask the customer to try another card.";

/** Tokens for the system prompt and task, on top of the tool definitions. */
const PROMPT_TOKEN_COUNT = 120;
const TOKENS_PER_TOOL_RESULT = 150;
const OUTPUT_TOKENS_PER_TOOL_TURN = 30;
const OUTPUT_TOKENS_FOR_ANSWER = 60;

/**
 * Run usage like a cached Anthropic run: turn 0 writes the tools and system prompt to the cache,
 * later turns read them, and the uncached part grows with each tool result.
 */
function simulatedModelUsage(toolNames: ReadonlyArray<string>): ModelUsage {
  const turnCount = SCRIPTED_TOOL_CALLS.length + 1;
  const toolDefinitions = toolNames.flatMap((toolName) => findMockTool(toolName) ?? []);
  const cachedPrefixTokenCount = estimateCatalogSize(toolDefinitions).estimatedTokenCount;
  let uncachedTokenCount = 0;
  for (let turnIndex = 0; turnIndex < turnCount; turnIndex += 1) {
    uncachedTokenCount += PROMPT_TOKEN_COUNT + turnIndex * TOKENS_PER_TOOL_RESULT;
  }
  const tokenUsage = {
    inputTokens: uncachedTokenCount,
    outputTokens:
      SCRIPTED_TOOL_CALLS.length * OUTPUT_TOKENS_PER_TOOL_TURN + OUTPUT_TOKENS_FOR_ANSWER,
    cacheReadTokens: cachedPrefixTokenCount * (turnCount - 1),
    cacheWriteTokens: cachedPrefixTokenCount,
  };
  const modelPrice = findModelPrice(LIVE_MODEL_IDENTIFIER, DEFAULT_MODEL_PRICES);
  return {
    inputTokens: tokenUsage.inputTokens,
    outputTokens: tokenUsage.outputTokens,
    cacheReadInputTokens: tokenUsage.cacheReadTokens,
    cacheCreationInputTokens: tokenUsage.cacheWriteTokens,
    webSearchRequests: 0,
    costUSD: modelPrice === null ? 0 : costFromUsage(tokenUsage, modelPrice),
    contextWindow: 200_000,
    maxOutputTokens: 64_000,
  };
}

// The SDK message types carry many fields a consumer of this stream never reads. These builders
// fill the fields krino and this example read, and cast the rest, as krino's adapter tests do.

function simulatedMessage(messageFields: Record<string, unknown>): SDKMessage {
  return { session_id: SESSION_ID, uuid: crypto.randomUUID(), ...messageFields } as SDKMessage;
}

function systemInitMessage(modelIdentifier: string, agentToolNames: Array<string>): SDKMessage {
  return simulatedMessage({
    type: "system",
    subtype: "init",
    model: modelIdentifier,
    tools: agentToolNames,
  });
}

function assistantMessage(contentBlocks: Array<Record<string, unknown>>): SDKMessage {
  return simulatedMessage({
    type: "assistant",
    message: { role: "assistant", content: contentBlocks },
    parent_tool_use_id: null,
  });
}

function toolResultMessage(toolUseId: string, resultText: string, isError: boolean): SDKMessage {
  return simulatedMessage({
    type: "user",
    message: {
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: toolUseId, content: resultText, is_error: isError },
      ],
    },
    parent_tool_use_id: null,
  });
}

function resultMessage(modelIdentifier: string, modelUsage: ModelUsage): SDKMessage {
  return simulatedMessage({
    type: "result",
    subtype: "success",
    is_error: false,
    result: SCRIPTED_ANSWER,
    num_turns: SCRIPTED_TOOL_CALLS.length + 1,
    total_cost_usd: modelUsage.costUSD,
    modelUsage: { [modelIdentifier]: modelUsage },
    duration_ms: 0,
    duration_api_ms: 0,
  });
}

function isDenied(hookOutput: HookJSONOutput): boolean {
  return (
    "hookSpecificOutput" in hookOutput &&
    hookOutput.hookSpecificOutput?.hookEventName === "PreToolUse" &&
    hookOutput.hookSpecificOutput.permissionDecision === "deny"
  );
}

/** Runs every PreToolUse hook that matches, as the SDK does. `false` if one denies the call. */
async function runPreToolUseHooks(
  queryOptions: Options,
  hookInput: PreToolUseHookInput,
): Promise<boolean> {
  let isAllowed = true;
  for (const hookMatcher of queryOptions.hooks?.PreToolUse ?? []) {
    const matchesTool =
      hookMatcher.matcher === undefined ||
      new RegExp(hookMatcher.matcher).test(hookInput.tool_name);
    if (!matchesTool) {
      continue;
    }
    for (const hookCallback of hookMatcher.hooks) {
      const hookOutput = await hookCallback(hookInput, hookInput.tool_use_id, {
        signal: new AbortController().signal,
      });
      isAllowed = isAllowed && !isDenied(hookOutput);
    }
  }
  return isAllowed;
}

/** A stand-in for `query()`: calls the two log tools, then answers. */
export function createSimulatedAgent(toolCount: ToolCount): StartAgent {
  const toolNames = selectLogTriageToolNames(toolCount);
  return async function* simulatedAgent(queryOptions) {
    const modelIdentifier = queryOptions.model ?? LIVE_MODEL_IDENTIFIER;
    yield systemInitMessage(modelIdentifier, toolNames.map(toClaudeAgentSdkToolName));
    for (const [callIndex, scriptedToolCall] of SCRIPTED_TOOL_CALLS.entries()) {
      const agentToolName = toClaudeAgentSdkToolName(scriptedToolCall.toolName);
      const toolUseId = `simulated-tool-use-${callIndex}`;
      yield assistantMessage([
        { type: "tool_use", id: toolUseId, name: agentToolName, input: scriptedToolCall.toolInput },
      ]);
      const isAllowed = await runPreToolUseHooks(queryOptions, {
        hook_event_name: "PreToolUse",
        session_id: SESSION_ID,
        transcript_path: "",
        cwd: process.cwd(),
        tool_name: agentToolName,
        tool_input: scriptedToolCall.toolInput,
        tool_use_id: toolUseId,
      });
      const toolResult = isAllowed
        ? toCallToolResult(executeMockTool(scriptedToolCall.toolName, scriptedToolCall.toolInput))
        : { content: [{ type: "text", text: "Denied by a PreToolUse hook." }], isError: true };
      const resultText = toolResult.content
        .flatMap((contentPart) => (contentPart.type === "text" ? [contentPart.text] : []))
        .join("\n");
      yield toolResultMessage(toolUseId, resultText, toolResult.isError === true);
    }
    yield assistantMessage([{ type: "text", text: SCRIPTED_ANSWER }]);
    yield resultMessage(modelIdentifier, simulatedModelUsage(toolNames));
  };
}

/**
 * Answers tool selection like a good decision provider: the task needs the two log tools and
 * nothing else. Risk questions (asked only for write tools; read-only tools are always allowed)
 * fall through to the fake's conservative answer, which suggests askHuman.
 */
export const answerLikeAGoodProvider: FakeAnswerFunction = (decisionQuestion) => {
  if (decisionQuestion.decisionKind !== "toolSelection") {
    return null;
  }
  const isNeeded = LOG_TRIAGE_TOOL_NAMES.some((toolName) =>
    decisionQuestion.questionText.startsWith(
      `Does the agent need the tool "${toClaudeAgentSdkToolName(toolName)}"`,
    ),
  );
  return { choice: isNeeded ? "yes" : "no", probability: 0.95 };
};

export type SimulatedRunOptions = { traceDirectory: string; toolCount: ToolCount };

export function runSimulatedLogTriage(
  simulatedRunOptions: SimulatedRunOptions,
): Promise<LogTriageResult> {
  return runLogTriage({
    startAgent: createSimulatedAgent(simulatedRunOptions.toolCount),
    decisionProvider: createFakeDecisionProvider({
      answerQuestion: answerLikeAGoodProvider,
      latencyInMilliseconds: 20,
    }),
    traceDirectory: simulatedRunOptions.traceDirectory,
    toolCount: simulatedRunOptions.toolCount,
  });
}
