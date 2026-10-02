import type {
  AgentStepTrace,
  DecisionAnswer,
  DecisionProvider,
  DecisionQuestion,
  DecisionRequestOptions,
  HostCapabilities,
  RunStartOptions,
  RunSummaryInput,
  RunSummaryTrace,
  StepContext,
  StepTraceInput,
  TraceSink,
} from "../contracts/index.js";

// Test doubles for core tests, used until the WP-03 fake provider merges.
// Not exported from the package.

export type RecordedProviderCall = {
  decisionQuestions: Array<DecisionQuestion>;
  stepContext: StepContext;
  requestOptions: DecisionRequestOptions;
};

export type LocalTestProviderBehavior =
  | {
      behaviorKind: "answer";
      answerQuestions: (decisionQuestions: Array<DecisionQuestion>) => Array<DecisionAnswer>;
    }
  | { behaviorKind: "reject"; rejectionCause: unknown }
  | { behaviorKind: "throwSynchronously"; thrownCause: unknown };

export type LocalTestProvider = DecisionProvider & {
  readonly recordedCalls: ReadonlyArray<RecordedProviderCall>;
  readonly abortedCallCount: () => number;
};

export const TEST_DECISION_MODEL_VERSION = "test-model-1";

export function answerEveryQuestion(
  choice: string,
  probability: number,
): LocalTestProviderBehavior {
  return {
    behaviorKind: "answer",
    answerQuestions: (decisionQuestions) =>
      decisionQuestions.map(() => ({
        choice,
        probability,
        decisionModelVersion: TEST_DECISION_MODEL_VERSION,
        latencyInMilliseconds: 1,
      })),
  };
}

/** Answers "yes" for the named tools and "no" for every other tool question. */
export function answerToolsNeeded(
  neededToolNames: ReadonlyArray<string>,
  probability: number,
): LocalTestProviderBehavior {
  return {
    behaviorKind: "answer",
    answerQuestions: (decisionQuestions) =>
      decisionQuestions.map((decisionQuestion) => ({
        choice: neededToolNames.some((toolName) =>
          decisionQuestion.questionText.includes(`"${toolName}"`),
        )
          ? "yes"
          : "no",
        probability,
        decisionModelVersion: TEST_DECISION_MODEL_VERSION,
        latencyInMilliseconds: 1,
      })),
  };
}

export function createLocalTestProvider(
  providerBehavior: LocalTestProviderBehavior,
  latencyInMilliseconds = 0,
): LocalTestProvider {
  const recordedCalls: Array<RecordedProviderCall> = [];
  let abortedCalls = 0;

  const askDecisionQuestions = (
    decisionQuestions: Array<DecisionQuestion>,
    stepContext: StepContext,
    requestOptions: DecisionRequestOptions,
  ): Promise<Array<DecisionAnswer>> => {
    recordedCalls.push({ decisionQuestions, stepContext, requestOptions });
    if (providerBehavior.behaviorKind === "throwSynchronously") {
      throw providerBehavior.thrownCause;
    }
    return new Promise<Array<DecisionAnswer>>((resolveAnswers, rejectAnswers) => {
      const answerHandle = setTimeout(() => {
        if (providerBehavior.behaviorKind === "reject") {
          rejectAnswers(providerBehavior.rejectionCause);
          return;
        }
        resolveAnswers(providerBehavior.answerQuestions(decisionQuestions));
      }, latencyInMilliseconds);
      requestOptions.abortSignal.addEventListener("abort", () => {
        abortedCalls += 1;
        clearTimeout(answerHandle);
        rejectAnswers(new Error("aborted"));
      });
    });
  };

  return {
    providerName: "local-test",
    askDecisionQuestions,
    recordedCalls,
    abortedCallCount: () => abortedCalls,
  };
}

export type RecordingTraceSink = TraceSink & {
  readonly writtenRecords: Array<AgentStepTrace | RunSummaryTrace>;
  readonly flushTimeouts: Array<number>;
  stepTraces: () => Array<AgentStepTrace>;
  runSummaries: () => Array<RunSummaryTrace>;
};

export function createRecordingTraceSink(): RecordingTraceSink {
  const writtenRecords: Array<AgentStepTrace | RunSummaryTrace> = [];
  const flushTimeouts: Array<number> = [];
  return {
    writtenRecords,
    flushTimeouts,
    writeRecord: (traceRecord) => {
      writtenRecords.push(traceRecord);
    },
    flush: async (timeoutInMilliseconds) => {
      flushTimeouts.push(timeoutInMilliseconds);
    },
    stepTraces: () =>
      writtenRecords.filter(
        (traceRecord): traceRecord is AgentStepTrace => traceRecord.recordType === "agentStep",
      ),
    runSummaries: () =>
      writtenRecords.filter(
        (traceRecord): traceRecord is RunSummaryTrace => traceRecord.recordType === "runSummary",
      ),
  };
}

export const AI_SDK_CAPABILITIES: HostCapabilities = {
  supportedDecisions: ["toolSelection", "riskGate"],
  toolSelectionTiming: "perStep",
  reportsPerStepUsage: true,
};

export function aiSdkRunStart(
  capabilities: HostCapabilities = AI_SDK_CAPABILITIES,
): RunStartOptions {
  return { hostName: "ai-sdk", hostSdkVersion: "7.0.0-test", capabilities };
}

export function stepTraceInput(stepFields: Partial<StepTraceInput> = {}): StepTraceInput {
  return {
    runIdentifier: "run-under-test",
    stepNumber: 0,
    hostName: "ai-sdk",
    hostSdkVersion: "7.0.0-test",
    modelIdentifier: "claude-sonnet-5-5",
    availableToolNames: [],
    chosenToolNames: [],
    tokenUsage: null,
    costInUsd: null,
    latencyInMilliseconds: null,
    decisions: [],
    contentHash: null,
    ...stepFields,
  };
}

export function runSummaryInput(summaryFields: Partial<RunSummaryInput> = {}): RunSummaryInput {
  return {
    runIdentifier: "run-under-test",
    hostName: "ai-sdk",
    hostSdkVersion: "7.0.0-test",
    modelIdentifier: "claude-sonnet-5-5",
    totalTokenUsage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    totalCostInUsd: 0,
    stepCount: 1,
    usedToolNames: [],
    toolSelectionAgreement: null,
    ...summaryFields,
  };
}
