import { estimateCatalogSize } from "@krinolabs/bench";
import { createFakeDecisionProvider, type FakeAnswerFunction } from "@krinolabs/krino";
import { MockLanguageModelV4 } from "ai/test";
import { selectLogTriageTools, type ToolCount } from "./log-triage.js";
import type { ResolvedExampleTask } from "./log-triage-tasks.js";
import { type LogTriageResult, runLogTriage } from "./run-log-triage.js";

// --fake: the AI SDK mock language model plays the task's scripted run, and krino's fake decision
// provider answers the decisions. No API key, no network.

/** The fake model's ID. krino prices it as Claude Haiku 4.5, so the report shows costs. */
export const FAKE_MODEL_IDENTIFIER = "claude-haiku-4-5";

type MockModelOptions = NonNullable<ConstructorParameters<typeof MockLanguageModelV4>[0]>;
type MockGenerate = Exclude<NonNullable<MockModelOptions["doGenerate"]>, Array<unknown>>;
type MockGenerateResult = Exclude<MockGenerate, (...callArguments: never) => unknown>;
type MockCallOptions = MockLanguageModelV4["doGenerateCalls"][number];
type MockUsage = MockGenerateResult["usage"];

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

function scriptedResult(
  task: ResolvedExampleTask,
  stepIndex: number,
  cachedPrefixTokenCount: number,
): MockGenerateResult {
  const scriptedToolCall = task.scriptedToolCalls[stepIndex];
  if (scriptedToolCall === undefined) {
    return {
      content: [{ type: "text", text: task.scriptedAnswer }],
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

/** A mock model that makes the task's scripted tool calls, then answers. */
export function createFakeLogTriageModel(
  task: ResolvedExampleTask,
  toolCount: ToolCount,
): MockLanguageModelV4 {
  const cachedPrefixTokenCount = estimateCatalogSize(
    selectLogTriageTools(toolCount, task.expectedToolNames),
  ).estimatedTokenCount;
  return new MockLanguageModelV4({
    provider: "anthropic.messages",
    modelId: FAKE_MODEL_IDENTIFIER,
    doGenerate: async (callOptions: MockCallOptions) => {
      // One assistant message per finished step.
      const stepIndex = callOptions.prompt.filter(
        (promptMessage) => promptMessage.role === "assistant",
      ).length;
      return scriptedResult(task, stepIndex, cachedPrefixTokenCount);
    },
  });
}

/**
 * Answers tool selection like a good decision provider: the task needs its expected tools and
 * nothing else. Risk questions (asked only for write tools; read-only tools are always allowed)
 * fall through to the fake's conservative answer, "not sure", which suggests askHuman.
 */
export function answerLikeAGoodProvider(
  neededToolNames: ReadonlyArray<string>,
): FakeAnswerFunction {
  return (decisionQuestion) => {
    if (decisionQuestion.decisionKind !== "toolSelection") {
      return null;
    }
    const isNeeded = neededToolNames.some((toolName) =>
      decisionQuestion.questionText.startsWith(`Does the agent need the tool "${toolName}"`),
    );
    return { choice: isNeeded ? "yes" : "no", probability: 0.95 };
  };
}

export type FakeRunOptions = {
  traceDirectory: string;
  toolCount: ToolCount;
  task: ResolvedExampleTask;
};

export function runFakeLogTriage(fakeRunOptions: FakeRunOptions): Promise<LogTriageResult> {
  return runLogTriage({
    model: createFakeLogTriageModel(fakeRunOptions.task, fakeRunOptions.toolCount),
    decisionProvider: createFakeDecisionProvider({
      answerQuestion: answerLikeAGoodProvider(fakeRunOptions.task.expectedToolNames),
      latencyInMilliseconds: 20,
    }),
    traceDirectory: fakeRunOptions.traceDirectory,
    toolCount: fakeRunOptions.toolCount,
    task: fakeRunOptions.task,
  });
}
