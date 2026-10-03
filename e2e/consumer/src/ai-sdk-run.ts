import {
  createFakeDecisionProvider,
  createFileTraceSink,
  createKrino,
  DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS,
} from "@krinolabs/krino";
import { withKrino } from "@krinolabs/krino/ai-sdk";
import { generateText, jsonSchema, stepCountIs, type ToolSet, tool } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import {
  ANSWER_TEXT,
  answerLikeAGoodProvider,
  KRINO_RISK_GATE_POLICY,
  LOG_TOOLS,
  PROJECT_NAME,
  SCRIPTED_TOOL_CALLS,
  TASK_TEXT,
} from "./log-task.ts";

// An AI SDK run as a user would write it: generateText wrapped by withKrino, in shadow mode. The
// AI SDK's mock model plays a scripted run; krino's fake provider answers the decisions.
// Usage: node ai-sdk-run.ts <traceDirectory>

type MockModelOptions = NonNullable<ConstructorParameters<typeof MockLanguageModelV4>[0]>;
type MockGenerate = Exclude<NonNullable<MockModelOptions["doGenerate"]>, Array<unknown>>;
type MockGenerateResult = Exclude<MockGenerate, (...callArguments: never) => unknown>;
type MockCallOptions = MockLanguageModelV4["doGenerateCalls"][number];

const traceDirectory = process.argv[2];
if (traceDirectory === undefined) {
  throw new Error("Usage: node ai-sdk-run.ts <traceDirectory>");
}

/** Step 0 writes the tool definitions to the cache; later steps read them. */
function scriptedUsage(stepIndex: number): MockGenerateResult["usage"] {
  const cacheWrite = stepIndex === 0 ? 900 : 0;
  const cacheRead = stepIndex === 0 ? 0 : 900;
  const noCache = 120 + stepIndex * 150;
  return {
    inputTokens: { total: noCache + cacheRead + cacheWrite, noCache, cacheRead, cacheWrite },
    outputTokens: { total: 30, text: 30, reasoning: 0 },
  };
}

function scriptedResult(stepIndex: number): MockGenerateResult {
  const scriptedToolCall = SCRIPTED_TOOL_CALLS[stepIndex];
  if (scriptedToolCall === undefined) {
    return {
      content: [{ type: "text", text: ANSWER_TEXT }],
      finishReason: { unified: "stop", raw: "end_turn" },
      usage: scriptedUsage(stepIndex),
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
    usage: scriptedUsage(stepIndex),
    warnings: [],
  };
}

const model = new MockLanguageModelV4({
  provider: "anthropic.messages",
  modelId: "claude-haiku-4-5",
  doGenerate: async (callOptions: MockCallOptions) =>
    scriptedResult(
      callOptions.prompt.filter((promptMessage) => promptMessage.role === "assistant").length,
    ),
});

const tools: ToolSet = Object.fromEntries(
  LOG_TOOLS.map((logTool) => [
    logTool.toolName,
    tool({
      description: logTool.toolDescription,
      inputSchema: jsonSchema<Record<string, unknown>>({ type: "object" }),
      execute: async () => ({ toolName: logTool.toolName, result: logTool.result }),
    }),
  ]),
);

const krino = createKrino({
  projectName: PROJECT_NAME,
  decisionModes: { toolSelection: "shadow", riskGate: "shadow" },
  decisionProvider: createFakeDecisionProvider({
    answerQuestion: answerLikeAGoodProvider((toolName) => toolName),
  }),
  riskGatePolicy: KRINO_RISK_GATE_POLICY,
  traceSink: createFileTraceSink({ projectName: PROJECT_NAME, traceDirectory }),
});

const result = await generateText(
  withKrino({ model, prompt: TASK_TEXT, tools, stopWhen: stepCountIs(5) }, krino),
);
await krino.flushAll(DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS);

const usedToolNames = result.steps.flatMap((step) =>
  step.toolCalls.map((toolCall) => toolCall.toolName),
);
console.log(JSON.stringify({ usedToolNames, answerText: result.text }));
