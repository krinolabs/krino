// Type-level tests. `expectTypeOf` is checked by `tsc` (the `typecheck` task), so any drift
// from the frozen contract fails the build. Each test pins one exported type to its exact shape.

import { describe, expectTypeOf, it } from "vitest";
import type {
  AgentStepTrace,
  CreateKrino,
  DecisionAnswer,
  DecisionKind,
  DecisionMode,
  DecisionProvider,
  DecisionQuestion,
  DecisionRecord,
  DecisionRequestOptions,
  DecisionStatus,
  FailureRule,
  HostCapabilities,
  HostName,
  KrinoConfig,
  KrinoConfigDefaults,
  KrinoRuntime,
  ModelCandidate,
  ModelPrice,
  ModelRouteContext,
  ModelRouteOutcome,
  ModelRoutingPolicy,
  PendingToolCall,
  RiskGateOutcome,
  RiskGatePolicy,
  RiskGateVerdict,
  RunHandle,
  RunOutcome,
  RunStartOptions,
  RunSummaryInput,
  RunSummaryTrace,
  StepContext,
  StepTraceInput,
  TokenUsageRecord,
  ToolDescription,
  ToolSelectionOutcome,
  ToolSelectionTiming,
  TraceSchemaVersion,
  TraceSink,
} from "./index.js";
import {
  type DEFAULT_CACHE_READ_MULTIPLIER,
  type DEFAULT_CACHE_WRITE_MULTIPLIER,
  type DEFAULT_CONTEXT_SAFETY_MARGIN_RATIO,
  type DEFAULT_DECISION_CONTEXT_BUDGET_IN_TOKENS,
  type DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS,
  DecisionProviderError,
  DecisionTimeoutError,
  KRINO_CONFIG_DEFAULTS,
  KrinoConfigurationError,
  SUPPORTED_TRACE_SCHEMA_VERSIONS,
  TRACE_SCHEMA_VERSION,
} from "./index.js";
import type { StartedStubRun, StubKrinoRuntime, StubRuntimeOptions } from "./stub-runtime.js";

describe("decisions.ts types", () => {
  it("DecisionKind is the v0.2 set", () => {
    expectTypeOf<DecisionKind>().toEqualTypeOf<"toolSelection" | "riskGate" | "modelRouting">();
  });

  it("DecisionMode", () => {
    expectTypeOf<DecisionMode>().toEqualTypeOf<"off" | "shadow" | "enforce">();
  });

  it("FailureRule", () => {
    expectTypeOf<FailureRule>().toEqualTypeOf<"failOpen" | "failClosed">();
  });

  it("DecisionStatus", () => {
    expectTypeOf<DecisionStatus>().toEqualTypeOf<
      "answered" | "timedOut" | "failed" | "cutOff" | "skippedUnsupported" | "skippedExploration"
    >();
  });

  it("DecisionQuestion", () => {
    expectTypeOf<DecisionQuestion>().toEqualTypeOf<{
      decisionKind: DecisionKind;
      questionText: string;
      options: Array<string> | null;
      optionCriteria?: Array<string>;
    }>();
  });

  it("DecisionAnswer", () => {
    expectTypeOf<DecisionAnswer>().toEqualTypeOf<{
      choice: string;
      probability: number;
      decisionModelVersion: string;
      latencyInMilliseconds: number;
    }>();
  });
});

describe("provider.ts types", () => {
  it("DecisionRequestOptions", () => {
    expectTypeOf<DecisionRequestOptions>().toEqualTypeOf<{
      timeoutInMilliseconds: number;
      abortSignal: AbortSignal;
    }>();
  });

  it("DecisionProvider", () => {
    expectTypeOf<DecisionProvider>().toEqualTypeOf<{
      providerName: string;
      askDecisionQuestions: (
        decisionQuestions: Array<DecisionQuestion>,
        stepContext: StepContext,
        requestOptions: { timeoutInMilliseconds: number; abortSignal: AbortSignal },
      ) => Promise<Array<DecisionAnswer>>;
    }>();
  });
});

describe("host.ts types", () => {
  it("HostName", () => {
    expectTypeOf<HostName>().toEqualTypeOf<"ai-sdk" | "claude-agent-sdk" | "pi">();
  });

  it("ToolSelectionTiming", () => {
    expectTypeOf<ToolSelectionTiming>().toEqualTypeOf<"perStep" | "runStartOnly">();
  });

  it("HostCapabilities", () => {
    expectTypeOf<HostCapabilities>().toEqualTypeOf<{
      supportedDecisions: Array<DecisionKind>;
      toolSelectionTiming: ToolSelectionTiming;
      reportsPerStepUsage: boolean;
    }>();
  });

  it("ToolDescription", () => {
    expectTypeOf<ToolDescription>().toEqualTypeOf<{ toolName: string; toolDescription: string }>();
  });

  it("StepContext", () => {
    expectTypeOf<StepContext>().toEqualTypeOf<{
      runIdentifier: string;
      stepNumber: number;
      taskText: string;
      availableTools: Array<ToolDescription>;
      recentMessagesText: string;
    }>();
  });

  it("PendingToolCall", () => {
    expectTypeOf<PendingToolCall>().toEqualTypeOf<{
      runIdentifier: string;
      stepNumber: number;
      toolName: string;
      toolArguments: Record<string, unknown>;
    }>();
  });

  it("ModelRouteContext", () => {
    expectTypeOf<ModelRouteContext>().toEqualTypeOf<{
      stepContext: StepContext;
      hostModelIdentifier: string;
      availableCandidateIdentifiers: Array<string>;
      canApplyRoute: boolean;
    }>();
  });
});

describe("trace.ts types", () => {
  it("TRACE_SCHEMA_VERSION is the literal 2", () => {
    expectTypeOf(TRACE_SCHEMA_VERSION).toEqualTypeOf<2>();
  });

  it("TraceSchemaVersion is every version a reader accepts", () => {
    expectTypeOf<TraceSchemaVersion>().toEqualTypeOf<1 | 2>();
    expectTypeOf(SUPPORTED_TRACE_SCHEMA_VERSIONS).toEqualTypeOf<ReadonlyArray<1 | 2>>();
  });

  it("RunOutcome", () => {
    expectTypeOf<RunOutcome>().toEqualTypeOf<"completed" | "aborted" | "error">();
  });

  it("TokenUsageRecord", () => {
    expectTypeOf<TokenUsageRecord>().toEqualTypeOf<{
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens: number;
      cacheWriteTokens: number;
    }>();
  });

  it("DecisionRecord", () => {
    expectTypeOf<DecisionRecord>().toEqualTypeOf<{
      decisionKind: DecisionKind;
      decisionMode: DecisionMode;
      decisionStatus: DecisionStatus;
      suggestedChoice: string | null;
      appliedChoice: string | null;
      probability: number | null;
      decisionModelVersion: string | null;
      latencyInMilliseconds: number | null;
      decisionCostInUsd: number | null;
    }>();
  });

  it("AgentStepTrace", () => {
    expectTypeOf<AgentStepTrace>().toEqualTypeOf<{
      traceSchemaVersion: 2;
      recordType: "agentStep";
      projectName: string;
      runIdentifier: string;
      stepNumber: number;
      hostName: HostName;
      hostSdkVersion: string;
      modelIdentifier: string;
      availableToolNames: Array<string>;
      chosenToolNames: Array<string>;
      tokenUsage: TokenUsageRecord | null;
      costInUsd: number | null;
      latencyInMilliseconds: number | null;
      recordedAt: string;
      decisions: Array<DecisionRecord>;
      contentHash: string | null;
    }>();
  });

  it("RunSummaryTrace", () => {
    expectTypeOf<RunSummaryTrace>().toEqualTypeOf<{
      traceSchemaVersion: 2;
      recordType: "runSummary";
      projectName: string;
      runIdentifier: string;
      hostName: HostName;
      hostSdkVersion: string;
      modelIdentifier: string;
      totalTokenUsage: TokenUsageRecord;
      totalCostInUsd: number;
      stepCount: number;
      usedToolNames: Array<string>;
      toolSelectionAgreement: boolean | null;
      routingCounterfactualCostInUsd: number | null;
      runOutcome: RunOutcome | null;
      recordedAt: string;
    }>();
  });

  it("trace records form a union discriminated by recordType", () => {
    const describeRecord = (traceRecord: AgentStepTrace | RunSummaryTrace): string => {
      if (traceRecord.recordType === "agentStep") {
        expectTypeOf(traceRecord).toEqualTypeOf<AgentStepTrace>();
        return "step";
      }
      expectTypeOf(traceRecord).toEqualTypeOf<RunSummaryTrace>();
      return "summary";
    };
    expectTypeOf(describeRecord).returns.toEqualTypeOf<string>();
  });
});

describe("sink.ts types", () => {
  it("TraceSink", () => {
    expectTypeOf<TraceSink>().toEqualTypeOf<{
      writeRecord: (traceRecord: AgentStepTrace | RunSummaryTrace) => void;
      flush: (timeoutInMilliseconds: number) => Promise<void>;
    }>();
  });
});

describe("config.ts types", () => {
  it("KrinoConfig", () => {
    expectTypeOf<KrinoConfig>().toEqualTypeOf<{
      projectName: string;
      decisionModes: Partial<Record<DecisionKind, DecisionMode>>;
      minimumConfidence?: number;
      decisionTimeoutInMilliseconds?: number;
      explorationRate?: number;
      riskGatePolicy?: RiskGatePolicy;
      modelRoutingPolicy?: ModelRoutingPolicy;
      decisionProvider?: DecisionProvider;
      traceSink?: TraceSink;
      redactContent?: boolean;
      priceOverrides?: Array<ModelPrice>;
      randomSource?: () => number;
    }>();
  });

  it("KrinoConfig needs only projectName and decisionModes", () => {
    expectTypeOf({ projectName: "demo", decisionModes: {} }).toExtend<KrinoConfig>();
    expectTypeOf({ projectName: "demo" }).not.toExtend<KrinoConfig>();
    expectTypeOf({
      projectName: "demo",
      decisionModes: { routing: "shadow" as const },
    }).not.toExtend<KrinoConfig["decisionModes"]>();
  });

  it("RiskGatePolicy", () => {
    expectTypeOf<RiskGatePolicy>().toEqualTypeOf<{
      blockedToolNames: Array<string>;
      alwaysAllowedToolNames: Array<string>;
      allowThresholdByToolName: Record<string, number>;
    }>();
  });

  it("ModelCandidate", () => {
    expectTypeOf<ModelCandidate>().toEqualTypeOf<{ modelIdentifier: string; useWhen: string }>();
  });

  it("ModelRoutingPolicy", () => {
    expectTypeOf<ModelRoutingPolicy>().toEqualTypeOf<{
      candidateModels: Array<ModelCandidate>;
      fallbackModelIdentifier: string;
    }>();
  });

  it("ModelPrice", () => {
    expectTypeOf<ModelPrice>().toEqualTypeOf<{
      modelIdentifier: string;
      inputPricePerMillionTokens: number;
      outputPricePerMillionTokens: number;
      cacheWriteMultiplier: number;
      cacheReadMultiplier: number;
      verifiedOn: string;
    }>();
  });
});

describe("runtime.ts types", () => {
  it("ToolSelectionOutcome", () => {
    expectTypeOf<ToolSelectionOutcome>().toEqualTypeOf<{
      toolNamesToSend: Array<string>;
      decisionRecord: DecisionRecord;
    }>();
  });

  it("ModelRouteOutcome", () => {
    expectTypeOf<ModelRouteOutcome>().toEqualTypeOf<{
      modelIdentifierToUse: string;
      decisionRecord: DecisionRecord;
    }>();
  });

  it("RiskGateVerdict", () => {
    expectTypeOf<RiskGateVerdict>().toEqualTypeOf<"allow" | "askHuman" | "block">();
  });

  it("RiskGateOutcome", () => {
    expectTypeOf<RiskGateOutcome>().toEqualTypeOf<{
      verdictToApply: RiskGateVerdict | null;
      suggestedVerdict: RiskGateVerdict;
      decisionRecord: DecisionRecord;
    }>();
  });

  it("RunStartOptions", () => {
    expectTypeOf<RunStartOptions>().toEqualTypeOf<{
      hostName: HostName;
      hostSdkVersion: string;
      capabilities: HostCapabilities;
      hostModelPrices?: Array<ModelPrice>;
    }>();
  });

  it("StepTraceInput is AgentStepTrace without runtime-filled fields", () => {
    expectTypeOf<StepTraceInput>().toEqualTypeOf<
      Omit<AgentStepTrace, "traceSchemaVersion" | "recordType" | "projectName" | "recordedAt">
    >();
    expectTypeOf<StepTraceInput>().not.toHaveProperty("recordedAt");
    expectTypeOf<StepTraceInput>().toHaveProperty("decisions");
  });

  it("RunSummaryInput is RunSummaryTrace without runtime-filled fields, runOutcome optional", () => {
    expectTypeOf<RunSummaryInput>().toEqualTypeOf<
      Omit<
        RunSummaryTrace,
        | "traceSchemaVersion"
        | "recordType"
        | "projectName"
        | "recordedAt"
        | "routingCounterfactualCostInUsd"
        | "runOutcome"
      > & { runOutcome?: RunOutcome | null }
    >();
    expectTypeOf<RunSummaryInput>().not.toHaveProperty("projectName");
    expectTypeOf<RunSummaryInput>().not.toHaveProperty("routingCounterfactualCostInUsd");
    expectTypeOf<RunSummaryInput>().toHaveProperty("toolSelectionAgreement");
  });

  it("RunSummaryInput works without runOutcome (v0.1 adapters)", () => {
    expectTypeOf<{
      runIdentifier: string;
      hostName: HostName;
      hostSdkVersion: string;
      modelIdentifier: string;
      totalTokenUsage: TokenUsageRecord;
      totalCostInUsd: number;
      stepCount: number;
      usedToolNames: Array<string>;
      toolSelectionAgreement: boolean | null;
    }>().toExtend<RunSummaryInput>();
  });

  it("RunHandle", () => {
    expectTypeOf<RunHandle>().toEqualTypeOf<{
      runIdentifier: string;
      decideToolSelection: (stepContext: StepContext) => Promise<ToolSelectionOutcome>;
      decideModelRoute: (modelRouteContext: ModelRouteContext) => Promise<ModelRouteOutcome>;
      checkToolCallRisk: (pendingToolCall: PendingToolCall) => Promise<RiskGateOutcome>;
      recordStep: (stepTrace: StepTraceInput) => void;
      finishRun: (runSummary: RunSummaryInput) => Promise<void>;
    }>();
  });

  it("KrinoRuntime", () => {
    expectTypeOf<KrinoRuntime>().toEqualTypeOf<{
      startRun: (runStart: RunStartOptions) => RunHandle;
      flushAll: (timeoutInMilliseconds: number) => Promise<void>;
    }>();
  });

  it("CreateKrino", () => {
    expectTypeOf<CreateKrino>().toEqualTypeOf<(krinoConfig: KrinoConfig) => KrinoRuntime>();
  });
});

describe("defaults.ts types", () => {
  it("KrinoConfigDefaults", () => {
    expectTypeOf<KrinoConfigDefaults>().toEqualTypeOf<{
      decisionModes: Readonly<Record<DecisionKind, DecisionMode>>;
      minimumConfidence: number;
      decisionTimeoutInMilliseconds: number;
      explorationRate: number;
      redactContent: boolean;
    }>();
  });

  it("KrinoConfigDefaults covers every optional scalar in KrinoConfig it names", () => {
    expectTypeOf<
      Pick<
        Required<KrinoConfig>,
        "minimumConfidence" | "decisionTimeoutInMilliseconds" | "explorationRate" | "redactContent"
      >
    >().toEqualTypeOf<Omit<KrinoConfigDefaults, "decisionModes">>();
  });
});

describe("stub-runtime.ts types", () => {
  it("StubRuntimeOptions", () => {
    expectTypeOf<StubRuntimeOptions>().toEqualTypeOf<{ currentTime?: () => Date }>();
  });

  it("StartedStubRun", () => {
    expectTypeOf<StartedStubRun>().toEqualTypeOf<RunStartOptions & { runIdentifier: string }>();
  });

  it("StubKrinoRuntime is a KrinoRuntime with read-only records", () => {
    expectTypeOf<StubKrinoRuntime>().toExtend<KrinoRuntime>();
    expectTypeOf<StubKrinoRuntime>().toEqualTypeOf<
      KrinoRuntime & {
        readonly startedRuns: ReadonlyArray<StartedStubRun>;
        readonly toolSelectionRequests: ReadonlyArray<StepContext>;
        readonly modelRouteRequests: ReadonlyArray<ModelRouteContext>;
        readonly riskGateRequests: ReadonlyArray<PendingToolCall>;
        readonly writtenTraces: ReadonlyArray<AgentStepTrace | RunSummaryTrace>;
        readonly flushTimeouts: ReadonlyArray<number>;
      }
    >();
  });
});

describe("defaults.ts values", () => {
  it("KRINO_CONFIG_DEFAULTS is a read-only KrinoConfigDefaults", () => {
    expectTypeOf(KRINO_CONFIG_DEFAULTS).toEqualTypeOf<Readonly<KrinoConfigDefaults>>();
  });

  it("cache multipliers are number literals", () => {
    expectTypeOf<typeof DEFAULT_CACHE_WRITE_MULTIPLIER>().toEqualTypeOf<1.25>();
    expectTypeOf<typeof DEFAULT_CACHE_READ_MULTIPLIER>().toEqualTypeOf<0.1>();
  });

  it("runtime limits are number literals", () => {
    expectTypeOf<typeof DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS>().toEqualTypeOf<2000>();
    expectTypeOf<typeof DEFAULT_DECISION_CONTEXT_BUDGET_IN_TOKENS>().toEqualTypeOf<32000>();
    expectTypeOf<typeof DEFAULT_CONTEXT_SAFETY_MARGIN_RATIO>().toEqualTypeOf<0.1>();
  });
});

describe("errors.ts types", () => {
  it("KrinoConfigurationError", () => {
    expectTypeOf<KrinoConfigurationError>().toExtend<Error>();
    expectTypeOf<KrinoConfigurationError["name"]>().toEqualTypeOf<"KrinoConfigurationError">();
    expectTypeOf<KrinoConfigurationError["configFieldName"]>().toEqualTypeOf<string | null>();
    expectTypeOf(KrinoConfigurationError).constructorParameters.toEqualTypeOf<
      [message: string, errorDetails?: { configFieldName?: string; cause?: unknown } | undefined]
    >();
  });

  it("DecisionProviderError", () => {
    expectTypeOf<DecisionProviderError>().toExtend<Error>();
    expectTypeOf<DecisionProviderError["name"]>().toEqualTypeOf<"DecisionProviderError">();
    expectTypeOf<DecisionProviderError["providerName"]>().toEqualTypeOf<string>();
    expectTypeOf(DecisionProviderError).constructorParameters.toEqualTypeOf<
      [message: string, errorDetails: { providerName: string; cause?: unknown }]
    >();
  });

  it("DecisionTimeoutError", () => {
    expectTypeOf<DecisionTimeoutError>().toExtend<Error>();
    expectTypeOf<DecisionTimeoutError["name"]>().toEqualTypeOf<"DecisionTimeoutError">();
    expectTypeOf<DecisionTimeoutError["providerName"]>().toEqualTypeOf<string>();
    expectTypeOf<DecisionTimeoutError["timeoutInMilliseconds"]>().toEqualTypeOf<number>();
    expectTypeOf(DecisionTimeoutError).constructorParameters.toEqualTypeOf<
      [errorDetails: { providerName: string; timeoutInMilliseconds: number }]
    >();
  });
});
