import { estimateCatalogSize } from "@krinolabs/bench";
import { createFakeDecisionProvider, type FakeAnswerFunction } from "@krinolabs/krino";
import { MockLanguageModelV4 } from "ai/test";
import { LOG_TRIAGE_TOOL_NAMES, selectLogTriageTools, type ToolCount } from "./log-triage.js";
import { type LogTriageResult, runLogTriage } from "./run-log-triage.js";

// --fake: the AI SDK mock language model plays a scripted run, and krino's fake decision
// provider answers the decisions. No API key, no network.

/** The fake model's ID. krino prices it as Claude Haiku 4.5, so the report shows costs. */
export const FAKE_MODEL_IDENTIFIER = "claude-haiku-4-5";

type MockModelOptions = NonNullable<ConstructorParameters<typeof MockLanguageModelV4>[0]>;
type MockGenerate = Exclude<NonNullable<MockModelOptions["doGenerate"]>, Array<unknown>>;
type MockGenerateResult = Exclude<MockGenerate, (...callArguments: never) => unknown>;
type MockCallOptions = MockLanguageModelV4["doGenerateCalls"][number];
type MockUsage = MockGenerateResult["usage"];

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

/**
 * Usage like a cached Anthropic run: step 0 writes the tools and system prompt to the cache,
 * later steps read them, and the uncached part grows with each tool result.
 */
function scriptedUsage(
  stepIndex: number,
  cachedPrefixTokenCount: number,
  outputTokenCount: number,
): MockUsage {
  const uncachedTokenCount = PROMPT_TOKEN_COUNT + stepIndex * TOKENS_PER_TOOL_RESULT;
  const cacheWriteTokenCount = stepIndex === 0 ? cachedPrefixTokenCount : 0;
  const cacheReadTokenCount = stepIndex === 0 ? 0 : cachedPrefixTokenCount;
  return {
    inputTokens: {
      total: uncachedTokenCount + cacheWriteTokenCount + cacheReadTokenCount,
      noCache: uncachedTokenCount,
      cacheRead: cacheReadTokenCount,
      cacheWrite: cacheWriteTokenCount,
    },
    outputTokens: { total: outputTokenCount, text: outputTokenCount, reasoning: 0 },
  };
}

function scriptedResult(stepIndex: number, cachedPrefixTokenCount: number): MockGenerateResult {
  const scriptedToolCall = SCRIPTED_TOOL_CALLS[stepIndex];
  if (scriptedToolCall === undefined) {
    return {
      content: [{ type: "text", text: SCRIPTED_ANSWER }],
      finishReason: { unified: "stop", raw: "end_turn" },
      usage: scriptedUsage(stepIndex, cachedPrefixTokenCount, 60),
      warnings: [],
    };
  }
  return {
    content: [
      {
        type: "tool-call",
        toolCallId: `call-${stepIndex}`,
        toolName: scriptedToolCall.toolName,
        input: JSON.stringify(scriptedToolCall.toolInput),
      },
    ],
    finishReason: { unified: "tool-calls", raw: "tool_use" },
    usage: scriptedUsage(stepIndex, cachedPrefixTokenCount, 30),
    warnings: [],
  };
}

/** A mock model that calls the two log tools, then answers. */
export function createFakeLogTriageModel(toolCount: ToolCount): MockLanguageModelV4 {
  const cachedPrefixTokenCount = estimateCatalogSize(
    selectLogTriageTools(toolCount),
  ).estimatedTokenCount;
  return new MockLanguageModelV4({
    provider: "anthropic.messages",
    modelId: FAKE_MODEL_IDENTIFIER,
    doGenerate: async (callOptions: MockCallOptions) => {
      // One assistant message per finished step.
      const stepIndex = callOptions.prompt.filter(
        (promptMessage) => promptMessage.role === "assistant",
      ).length;
      return scriptedResult(stepIndex, cachedPrefixTokenCount);
    },
  });
}

/**
 * Answers like a good decision provider: the task needs the two log tools and nothing else,
 * and calling a read-only log tool is safe.
 */
export const answerLikeAGoodProvider: FakeAnswerFunction = (decisionQuestion) => {
  if (decisionQuestion.decisionKind === "toolSelection") {
    const isNeeded = LOG_TRIAGE_TOOL_NAMES.some((toolName) =>
      decisionQuestion.questionText.startsWith(`Does the agent need the tool "${toolName}"`),
    );
    return { choice: isNeeded ? "yes" : "no", probability: 0.95 };
  }
  if (decisionQuestion.decisionKind === "riskGate") {
    return { choice: "yes", probability: 0.9 };
  }
  return null;
};

export type FakeRunOptions = { traceDirectory: string; toolCount: ToolCount };

export function runFakeLogTriage(fakeRunOptions: FakeRunOptions): Promise<LogTriageResult> {
  return runLogTriage({
    model: createFakeLogTriageModel(fakeRunOptions.toolCount),
    decisionProvider: createFakeDecisionProvider({
      answerQuestion: answerLikeAGoodProvider,
      latencyInMilliseconds: 20,
    }),
    traceDirectory: fakeRunOptions.traceDirectory,
    toolCount: fakeRunOptions.toolCount,
  });
}
