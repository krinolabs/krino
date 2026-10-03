import type {
  HookCallback,
  HookJSONOutput,
  ModelUsage,
  PreToolUseHookInput,
  SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { DecisionMode, KrinoConfig, ToolDescription } from "../../contracts/index.js";
import { createKrinoRuntime } from "../../core/create-krino.js";
import {
  answerToolsNeeded,
  createLocalTestProvider,
  createRecordingTraceSink,
  type LocalTestProvider,
} from "../../core/local-test-doubles.js";

// Test helpers for the Claude Agent SDK adapter. Not exported from the package.
// Tool names mirror the bench MCP server (`@krinolabs/bench/claude-agent-sdk`) without importing
// it: bench already depends on krino, so the reverse dependency would be a workspace cycle.

export const BENCH_MCP_SERVER_NAME = "krino-bench";

/** The name the Agent SDK gives a bench tool: `mcp__<server>__<tool>`. */
export function benchToolName(toolName: string): string {
  return `mcp__${BENCH_MCP_SERVER_NAME}__${toolName}`;
}

export const CANCEL_ORDER = benchToolName("cancel_order");
export const GET_ORDER_DETAILS = benchToolName("get_order_details");
export const LIST_ORDER_REFUNDS = benchToolName("list_order_refunds");
export const APPROVE_REFUND = benchToolName("approve_refund");

export const BENCH_TOOL_DESCRIPTIONS: Array<ToolDescription> = [
  { toolName: CANCEL_ORDER, toolDescription: "Cancel an order that has not shipped." },
  { toolName: GET_ORDER_DETAILS, toolDescription: "Get the details of one order." },
  { toolName: LIST_ORDER_REFUNDS, toolDescription: "List the refunds issued for an order." },
  { toolName: APPROVE_REFUND, toolDescription: "Approve a pending refund." },
];

/** Names that break code which indexes a plain object with an outside string. */
export const PROTOTYPE_KEY_NAMES = ["constructor", "toString", "__proto__"] as const;

export const TASK_TEXT = "Cancel order ORD-10422; the customer changed their mind.";

export type TestKrinoOptions = {
  toolSelectionMode?: DecisionMode;
  decisionProvider?: LocalTestProvider;
  configFields?: Partial<KrinoConfig>;
};

/** A real runtime with a local provider and an in-memory sink. No network, no files. */
export function createTestKrino(testOptions: TestKrinoOptions = {}) {
  const traceSink = createRecordingTraceSink();
  const warnings: Array<string> = [];
  const decisionProvider =
    testOptions.decisionProvider ?? createLocalTestProvider(answerToolsNeeded([CANCEL_ORDER], 1));
  let runCounter = 0;
  const krinoRuntime = createKrinoRuntime(
    {
      projectName: "claude-agent-sdk-adapter-test",
      decisionModes: { toolSelection: testOptions.toolSelectionMode ?? "shadow" },
      explorationRate: 0,
      decisionProvider,
      traceSink,
      riskGatePolicy: {
        blockedToolNames: [],
        alwaysAllowedToolNames: [GET_ORDER_DETAILS],
        allowThresholdByToolName: { [CANCEL_ORDER]: 0.9 },
      },
      ...testOptions.configFields,
    },
    {
      currentTime: () => new Date("2026-10-03T09:00:00.000Z"),
      monotonicTime: () => Date.now(),
      createRunIdentifier: () => {
        runCounter += 1;
        return `claude-run-${runCounter}`;
      },
      warn: (warningMessage) => {
        warnings.push(warningMessage);
      },
    },
  );
  return { krinoRuntime, traceSink, warnings, decisionProvider };
}

export function preToolUseInput(
  toolName: string,
  toolInput: unknown = { orderId: "ORD-10422" },
): PreToolUseHookInput {
  return {
    hook_event_name: "PreToolUse",
    session_id: "session-under-test",
    transcript_path: "transcript.jsonl",
    cwd: ".",
    tool_name: toolName,
    tool_input: toolInput,
    tool_use_id: `tool-use-${toolName}`,
  };
}

export function callHook(hookCallback: HookCallback, toolName: string): Promise<HookJSONOutput> {
  return hookCallback(preToolUseInput(toolName), `tool-use-${toolName}`, {
    signal: new AbortController().signal,
  });
}

export function modelUsage(usageFields: Partial<ModelUsage> = {}): ModelUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    webSearchRequests: 0,
    costUSD: 0,
    contextWindow: 200_000,
    maxOutputTokens: 64_000,
    ...usageFields,
  };
}

type ResultFixture = {
  modelUsage: Record<string, ModelUsage>;
  totalCostInUsd: number;
  turnCount: number;
  subtype?: "success" | "error_during_execution";
};

// The SDK message types carry dozens of fields the adapter never reads. The fixtures fill the
// fields the adapter reads and cast the rest, so the tests stay readable.

export function resultMessage(resultFixture: ResultFixture): SDKMessage {
  const resultFields = {
    type: "result",
    subtype: resultFixture.subtype ?? "success",
    is_error: resultFixture.subtype === "error_during_execution",
    num_turns: resultFixture.turnCount,
    total_cost_usd: resultFixture.totalCostInUsd,
    modelUsage: resultFixture.modelUsage,
    duration_ms: 1_000,
    duration_api_ms: 900,
    result: "done",
    session_id: "session-under-test",
    uuid: "00000000-0000-4000-8000-000000000001",
  };
  return resultFields as unknown as SDKMessage;
}

export function systemInitMessage(modelIdentifier: string, toolNames: Array<string>): SDKMessage {
  const initFields = {
    type: "system",
    subtype: "init",
    model: modelIdentifier,
    tools: toolNames,
    session_id: "session-under-test",
    uuid: "00000000-0000-4000-8000-000000000002",
  };
  return initFields as unknown as SDKMessage;
}

export function assistantTextMessage(text: string): SDKMessage {
  const assistantFields = {
    type: "assistant",
    message: { role: "assistant", content: [{ type: "text", text }] },
    parent_tool_use_id: null,
    session_id: "session-under-test",
    uuid: "00000000-0000-4000-8000-000000000003",
  };
  return assistantFields as unknown as SDKMessage;
}

/**
 * A fake `query()` stream. `beforeMessage` runs before each message (for example, to call hooks
 * the way the SDK would). `failAfter` throws instead of yielding the message at that index.
 */
export async function* fakeMessageStream(
  messages: ReadonlyArray<SDKMessage>,
  streamOptions: {
    beforeMessage?: (messageIndex: number) => Promise<void>;
    failAfter?: number;
  } = {},
): AsyncGenerator<SDKMessage, void, undefined> {
  for (const [messageIndex, message] of messages.entries()) {
    if (streamOptions.failAfter === messageIndex) {
      throw new Error("stream broke");
    }
    await streamOptions.beforeMessage?.(messageIndex);
    yield message;
  }
}
