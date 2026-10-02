import { type Tool, type ToolSet, tool } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { vi } from "vitest";
import { z } from "zod";
import type {
  AgentStepTrace,
  KrinoConfig,
  KrinoRuntime,
  RunSummaryTrace,
  TraceSink,
} from "../../contracts/index.js";
import { createKrinoRuntime } from "../../core/index.js";
import {
  createFakeDecisionProvider,
  type FakeAnswerFunction,
  type FakeDecisionProvider,
} from "../../providers/fake/index.js";

// Test-only helpers for the AI SDK adapter: a small local tool set, a scripted mock model, and a
// real krino runtime that writes to memory. Not exported from the package.

type MockModelOptions = NonNullable<ConstructorParameters<typeof MockLanguageModelV4>[0]>;
type MockGenerate = Exclude<NonNullable<MockModelOptions["doGenerate"]>, Array<unknown>>;
type MockStream = Exclude<NonNullable<MockModelOptions["doStream"]>, Array<unknown>>;
export type MockGenerateResult = Exclude<MockGenerate, (...callArguments: never) => unknown>;
export type MockStreamResult = Exclude<MockStream, (...callArguments: never) => unknown>;
export type MockProviderUsage = MockGenerateResult["usage"];
export type MockCallOptions = MockLanguageModelV4["doGenerateCalls"][number];

export const LOCAL_TOOL_NAMES = [
  "searchOrders",
  "getOrder",
  "cancelOrder",
  "createRefund",
  "sendEmail",
  "lookupCustomer",
] as const;

export type ToolExecution = { toolName: string; toolInput: unknown };

/** Six order-desk tools whose `execute` records each call and returns a fixed result. */
export function createLocalToolSet(toolExecutions: Array<ToolExecution> = []): ToolSet {
  return Object.fromEntries(
    LOCAL_TOOL_NAMES.map((toolName) => [
      toolName,
      tool({
        description: `The ${toolName} tool of the order desk.`,
        inputSchema: z.object({ reference: z.string() }),
        execute: async (toolInput) => {
          toolExecutions.push({ toolName, toolInput });
          return { toolName, outcome: "done" };
        },
      }),
    ]),
  );
}

/** A tool that records its calls; used for names that collide with `Object.prototype`. */
export function createRecordingTool(toolName: string, toolExecutions: Array<ToolExecution>): Tool {
  return tool({
    description: `The ${toolName} tool.`,
    inputSchema: z.object({ reference: z.string() }),
    execute: async (toolInput) => {
      toolExecutions.push({ toolName, toolInput });
      return { toolName };
    },
  });
}

export const DEFAULT_PROVIDER_USAGE: MockProviderUsage = {
  inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 10, text: 10, reasoning: 0 },
};

export type ScriptedStep = {
  toolCalls?: Array<{ toolName: string; reference?: string }>;
  text?: string;
  usage?: MockProviderUsage;
  providerMetadata?: MockGenerateResult["providerMetadata"];
};

function generateResultFor(scriptedStep: ScriptedStep, stepIndex: number): MockGenerateResult {
  const toolCalls = scriptedStep.toolCalls ?? [];
  const result: MockGenerateResult = {
    content: [
      ...toolCalls.map((toolCall, callIndex) => ({
        type: "tool-call" as const,
        toolCallId: `call-${stepIndex}-${callIndex}`,
        toolName: toolCall.toolName,
        input: JSON.stringify({ reference: toolCall.reference ?? "A-1" }),
      })),
      ...(scriptedStep.text === undefined
        ? []
        : [{ type: "text" as const, text: scriptedStep.text }]),
    ],
    finishReason: {
      unified: toolCalls.length > 0 ? "tool-calls" : "stop",
      raw: toolCalls.length > 0 ? "tool_use" : "end_turn",
    },
    usage: scriptedStep.usage ?? DEFAULT_PROVIDER_USAGE,
    warnings: [],
  };
  if (scriptedStep.providerMetadata !== undefined) {
    result.providerMetadata = scriptedStep.providerMetadata;
  }
  return result;
}

/**
 * A mock model that plays `scriptedSteps` in order; the last one repeats if the run goes on.
 * The step comes from the prompt (one assistant message per finished step), so concurrent calls
 * on the same model each get their own script.
 */
export function createScriptedModel(
  scriptedSteps: Array<ScriptedStep>,
  modelId = "claude-haiku-4-5",
): MockLanguageModelV4 {
  const scriptedResultFor = (callOptions: MockCallOptions): MockGenerateResult => {
    const finishedStepCount = callOptions.prompt.filter(
      (promptMessage) => promptMessage.role === "assistant",
    ).length;
    const stepIndex = Math.min(finishedStepCount, scriptedSteps.length - 1);
    const scriptedStep = scriptedSteps[stepIndex];
    if (scriptedStep === undefined) {
      throw new Error("createScriptedModel needs at least one step");
    }
    return generateResultFor(scriptedStep, stepIndex);
  };
  return new MockLanguageModelV4({
    provider: "anthropic.messages",
    modelId,
    doGenerate: async (callOptions) => scriptedResultFor(callOptions),
    doStream: async (callOptions) => streamResultFor(scriptedResultFor(callOptions)),
  });
}

type MockStreamPart =
  MockStreamResult["stream"] extends ReadableStream<infer StreamPart> ? StreamPart : never;

function streamResultFor(generateResult: MockGenerateResult): MockStreamResult {
  const streamParts: Array<MockStreamPart> = [{ type: "stream-start", warnings: [] }];
  for (const contentPart of generateResult.content) {
    if (contentPart.type === "text") {
      streamParts.push(
        { type: "text-start", id: "text-1" },
        { type: "text-delta", id: "text-1", delta: contentPart.text },
        { type: "text-end", id: "text-1" },
      );
    } else if (contentPart.type === "tool-call") {
      streamParts.push(contentPart);
    }
  }
  const finishPart: MockStreamPart = {
    type: "finish",
    usage: generateResult.usage,
    finishReason: generateResult.finishReason,
  };
  if (generateResult.providerMetadata !== undefined) {
    finishPart.providerMetadata = generateResult.providerMetadata;
  }
  streamParts.push(finishPart);
  return {
    stream: new ReadableStream<MockStreamPart>({
      start(controller) {
        for (const streamPart of streamParts) {
          controller.enqueue(streamPart);
        }
        controller.close();
      },
    }),
  };
}

/** Tool names the model received on each call, in call order. */
export function sentToolNamesByCall(
  modelCalls: ReadonlyArray<MockCallOptions>,
): Array<Array<string>> {
  return modelCalls.map((modelCall) => (modelCall.tools ?? []).map((toolEntry) => toolEntry.name));
}

/** Picks exactly the named tools with high confidence; says no to every other tool. */
export function selectToolsAnswer(selectedToolNames: ReadonlyArray<string>): FakeAnswerFunction {
  return (decisionQuestion) => {
    if (decisionQuestion.decisionKind !== "toolSelection") {
      return null;
    }
    const isSelected = selectedToolNames.some((toolName) =>
      decisionQuestion.questionText.startsWith(`Does the agent need the tool "${toolName}"`),
    );
    return { choice: isSelected ? "yes" : "no", probability: 0.95 };
  };
}

export type TestKrino = {
  krinoRuntime: KrinoRuntime;
  decisionProvider: FakeDecisionProvider;
  writtenRecords: Array<AgentStepTrace | RunSummaryTrace>;
  warnings: Array<string>;
  stepTraces: () => Array<AgentStepTrace>;
  runSummaries: () => Array<RunSummaryTrace>;
  /** Waits until `summaryCount` run summaries are written (finishRun runs in the background). */
  waitForRunSummaries: (summaryCount: number) => Promise<Array<RunSummaryTrace>>;
};

export type TestKrinoOptions = {
  decisionModes?: KrinoConfig["decisionModes"];
  answerQuestion?: FakeAnswerFunction;
  riskGatePolicy?: KrinoConfig["riskGatePolicy"];
};

/** A real krino runtime with the fake provider and an in-memory sink. No exploration. */
export function createTestKrino(testOptions: TestKrinoOptions = {}): TestKrino {
  const writtenRecords: Array<AgentStepTrace | RunSummaryTrace> = [];
  const warnings: Array<string> = [];
  const traceSink: TraceSink = {
    writeRecord: (traceRecord) => {
      writtenRecords.push(traceRecord);
    },
    flush: async () => {},
  };
  const decisionProvider = createFakeDecisionProvider(
    testOptions.answerQuestion === undefined ? {} : { answerQuestion: testOptions.answerQuestion },
  );
  let runCounter = 0;
  const krinoConfig: KrinoConfig = {
    projectName: "krino-ai-sdk-adapter-test",
    decisionModes: testOptions.decisionModes ?? { toolSelection: "shadow", riskGate: "shadow" },
    explorationRate: 0,
    decisionProvider,
    traceSink,
  };
  if (testOptions.riskGatePolicy !== undefined) {
    krinoConfig.riskGatePolicy = testOptions.riskGatePolicy;
  }
  const krinoRuntime = createKrinoRuntime(krinoConfig, {
    createRunIdentifier: () => {
      runCounter += 1;
      return `test-run-${runCounter}`;
    },
    flushTimeoutInMilliseconds: 200,
    warn: (warningMessage) => {
      warnings.push(warningMessage);
    },
  });
  const stepTraces = (): Array<AgentStepTrace> =>
    writtenRecords.filter(
      (traceRecord): traceRecord is AgentStepTrace => traceRecord.recordType === "agentStep",
    );
  const runSummaries = (): Array<RunSummaryTrace> =>
    writtenRecords.filter(
      (traceRecord): traceRecord is RunSummaryTrace => traceRecord.recordType === "runSummary",
    );
  const waitForRunSummaries = async (summaryCount: number): Promise<Array<RunSummaryTrace>> => {
    await vi.waitFor(() => {
      if (runSummaries().length < summaryCount) {
        throw new Error(`waiting for ${summaryCount} run summaries`);
      }
    });
    return runSummaries();
  };
  return {
    krinoRuntime,
    decisionProvider,
    writtenRecords,
    warnings,
    stepTraces,
    runSummaries,
    waitForRunSummaries,
  };
}
