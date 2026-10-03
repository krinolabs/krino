import {
  CHARACTERS_PER_TOKEN,
  estimateCatalogSize,
  findMockTool,
  type JsonValue,
  type MockToolDefinition,
  type MockToolParameter,
} from "@krinolabs/bench";
import { FAKE_MODEL_IDENTIFIER, SYSTEM_PROMPT } from "@krinolabs/example-ai-sdk-cli/agent";
import { MockLanguageModelV4 } from "ai/test";

// --fake: the AI SDK mock model plays a task. It calls the task's expected tools in order, but
// only tools it was sent on that step; when the next one is missing it answers early. Usage
// follows Anthropic's prompt cache: the tool list and system prompt are the cached prefix, so a
// step that sends the same list as the previous step reads it, and a changed list writes it again.
// The numbers are simulated; the bench output says so.

type MockModelOptions = NonNullable<ConstructorParameters<typeof MockLanguageModelV4>[0]>;
type MockGenerate = Exclude<NonNullable<MockModelOptions["doGenerate"]>, Array<unknown>>;
type MockGenerateResult = Exclude<MockGenerate, (...callArguments: never) => unknown>;
type MockCallOptions = MockLanguageModelV4["doGenerateCalls"][number];
type MockUsage = MockGenerateResult["usage"];

/** The task message and framing, outside the cached prefix. */
export const FAKE_PROMPT_TOKEN_COUNT = 120;
/** Each tool call and its result add this many uncached tokens to every later step. */
export const FAKE_TOKENS_PER_TOOL_RESULT = 150;
export const FAKE_TOOL_CALL_OUTPUT_TOKEN_COUNT = 30;
export const FAKE_ANSWER_OUTPUT_TOKEN_COUNT = 60;

export const SYSTEM_PROMPT_TOKEN_COUNT = Math.ceil(SYSTEM_PROMPT.length / CHARACTERS_PER_TOKEN);

/** Tokens of the cached prefix: the tool definitions sent, plus the system prompt. */
export function cachedPrefixTokenCount(toolDefinitions: ReadonlyArray<MockToolDefinition>): number {
  return estimateCatalogSize(toolDefinitions).estimatedTokenCount + SYSTEM_PROMPT_TOKEN_COUNT;
}

function fakeParameterValue(parameter: MockToolParameter): JsonValue {
  switch (parameter.parameterType) {
    case "string":
      return parameter.allowedValues?.[0] ?? `${parameter.parameterName}-1`;
    case "integer":
    case "number":
      return 1;
    case "boolean":
      return true;
  }
}

/** An input the tool's schema accepts: every required parameter, with a plain value. */
export function fakeToolInput(toolDefinition: MockToolDefinition): Record<string, JsonValue> {
  return Object.fromEntries(
    toolDefinition.parameters
      .filter((parameter) => parameter.isRequired)
      .map((parameter) => [parameter.parameterName, fakeParameterValue(parameter)]),
  );
}

function offeredToolNames(callOptions: MockCallOptions): Array<string> {
  return (callOptions.tools ?? []).flatMap((offeredTool) =>
    offeredTool.type === "function" ? [offeredTool.name] : [],
  );
}

function simulatedUsage(
  stepIndex: number,
  prefixTokenCount: number,
  isCacheHit: boolean,
  outputTokenCount: number,
): MockUsage {
  const uncachedTokenCount = FAKE_PROMPT_TOKEN_COUNT + stepIndex * FAKE_TOKENS_PER_TOOL_RESULT;
  const cacheReadTokenCount = isCacheHit ? prefixTokenCount : 0;
  const cacheWriteTokenCount = isCacheHit ? 0 : prefixTokenCount;
  return {
    inputTokens: {
      total: uncachedTokenCount + cacheReadTokenCount + cacheWriteTokenCount,
      noCache: uncachedTokenCount,
      cacheRead: cacheReadTokenCount,
      cacheWrite: cacheWriteTokenCount,
    },
    outputTokens: { total: outputTokenCount, text: outputTokenCount, reasoning: 0 },
  };
}

/** A mock model for one run (it remembers the previous step's tool list). */
export function createFakeAgentModel(
  expectedToolNames: ReadonlyArray<string>,
): MockLanguageModelV4 {
  let previousToolListKey: string | null = null;
  return new MockLanguageModelV4({
    provider: "anthropic.messages",
    modelId: FAKE_MODEL_IDENTIFIER,
    doGenerate: async (callOptions: MockCallOptions) => {
      // One assistant message per finished step.
      const stepIndex = callOptions.prompt.filter(
        (promptMessage) => promptMessage.role === "assistant",
      ).length;
      const toolNames = offeredToolNames(callOptions);
      const offeredNames = new Set(toolNames);
      const toolListKey = [...offeredNames].sort().join(",");
      const isCacheHit = previousToolListKey === toolListKey;
      previousToolListKey = toolListKey;
      const prefixTokenCount = cachedPrefixTokenCount(
        toolNames.flatMap((toolName) => findMockTool(toolName) ?? []),
      );

      const nextToolName = expectedToolNames[stepIndex];
      const nextTool =
        nextToolName !== undefined && offeredNames.has(nextToolName)
          ? findMockTool(nextToolName)
          : undefined;
      if (nextTool === undefined) {
        return {
          content: [{ type: "text", text: "Simulated answer." }],
          finishReason: { unified: "stop", raw: "end_turn" },
          usage: simulatedUsage(
            stepIndex,
            prefixTokenCount,
            isCacheHit,
            FAKE_ANSWER_OUTPUT_TOKEN_COUNT,
          ),
          warnings: [],
        };
      }
      return {
        content: [
          {
            type: "tool-call",
            toolCallId: `call-${stepIndex}`,
            toolName: nextTool.toolName,
            input: JSON.stringify(fakeToolInput(nextTool)),
          },
        ],
        finishReason: { unified: "tool-calls", raw: "tool_use" },
        usage: simulatedUsage(
          stepIndex,
          prefixTokenCount,
          isCacheHit,
          FAKE_TOOL_CALL_OUTPUT_TOKEN_COUNT,
        ),
        warnings: [],
      };
    },
  });
}
