# 🧾 Contracts (written in WP-01, frozen after merge)

These types live in `packages/krino/src/contracts/`. Every other WP codes against them. WP-02 implements `KrinoRuntime`; adapters only call it.

```ts
// decisions.ts
export type DecisionKind = 'toolSelection' | 'riskGate';            // v0.1 only
export type DecisionMode = 'off' | 'shadow' | 'enforce';
export type FailureRule = 'failOpen' | 'failClosed';
export type DecisionStatus =
  | 'answered' | 'timedOut' | 'failed' | 'cutOff' | 'skippedUnsupported' | 'skippedExploration';

export type DecisionQuestion = {
  decisionKind: DecisionKind;
  questionText: string;
  options: Array<string> | null;           // null for yes/no questions
};

export type DecisionAnswer = {
  choice: string;
  probability: number;                     // 0..1
  decisionModelVersion: string;
  latencyInMilliseconds: number;
};

// provider.ts
export type DecisionProvider = {
  providerName: string;
  askDecisionQuestions: (
    decisionQuestions: Array<DecisionQuestion>,
    stepContext: StepContext,
    requestOptions: { timeoutInMilliseconds: number; abortSignal: AbortSignal },
  ) => Promise<Array<DecisionAnswer>>;
};

// host.ts
export type HostName = 'ai-sdk' | 'claude-agent-sdk';
export type ToolSelectionTiming = 'perStep' | 'runStartOnly';

export type HostCapabilities = {
  supportedDecisions: Array<DecisionKind>;
  toolSelectionTiming: ToolSelectionTiming;
  reportsPerStepUsage: boolean;
};

export type ToolDescription = { toolName: string; toolDescription: string };

export type StepContext = {
  runIdentifier: string;
  stepNumber: number;
  taskText: string;                        // redacted before it reaches a sink
  availableTools: Array<ToolDescription>;
  recentMessagesText: string;              // trimmed to the provider's context budget
};

export type PendingToolCall = {
  runIdentifier: string;
  stepNumber: number;
  toolName: string;
  toolArguments: Record<string, unknown>;
};

// trace.ts
export const TRACE_SCHEMA_VERSION = 1 as const;

export type TokenUsageRecord = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

export type DecisionRecord = {
  decisionKind: DecisionKind;
  decisionMode: DecisionMode;
  decisionStatus: DecisionStatus;
  suggestedChoice: string | null;
  appliedChoice: string | null;            // what the agent actually used
  probability: number | null;
  decisionModelVersion: string | null;
  latencyInMilliseconds: number | null;
  decisionCostInUsd: number | null;
};

export type AgentStepTrace = {
  traceSchemaVersion: typeof TRACE_SCHEMA_VERSION;
  projectName: string;
  runIdentifier: string;
  stepNumber: number;
  hostName: HostName;
  hostSdkVersion: string;
  modelIdentifier: string;
  availableToolNames: Array<string>;
  chosenToolNames: Array<string>;
  tokenUsage: TokenUsageRecord | null;     // null when the host reports usage per run only
  costInUsd: number | null;
  latencyInMilliseconds: number | null;
  recordedAt: string;                      // ISO 8601
  decisions: Array<DecisionRecord>;
  contentHash: string | null;
};

export type RunSummaryTrace = {
  traceSchemaVersion: typeof TRACE_SCHEMA_VERSION;
  recordType: 'runSummary';
  projectName: string;
  runIdentifier: string;
  hostName: HostName;
  totalTokenUsage: TokenUsageRecord;
  totalCostInUsd: number;
  stepCount: number;
  usedToolNames: Array<string>;
  recordedAt: string;
};

// sink.ts
export type TraceSink = {
  writeRecord: (traceRecord: AgentStepTrace | RunSummaryTrace) => void;
  flush: (timeoutInMilliseconds: number) => Promise<void>;
};

// config.ts
export type KrinoConfig = {
  projectName: string;
  decisionModes: Partial<Record<DecisionKind, DecisionMode>>;   // default: all 'shadow'
  minimumConfidence?: number;                                  // default 0.8
  decisionTimeoutInMilliseconds?: number;                      // default 800
  explorationRate?: number;                                    // default 0.05 (enforce only)
  riskGatePolicy?: RiskGatePolicy;
  decisionProvider?: DecisionProvider;                         // default: fake provider + warning
  traceSink?: TraceSink;                                       // default: file sink
  redactContent?: boolean;                                     // default true
  priceOverrides?: Array<ModelPrice>;
  randomSource?: () => number;                                 // injectable for tests
};

export type RiskGatePolicy = {
  blockedToolNames: Array<string>;
  alwaysAllowedToolNames: Array<string>;
  allowThresholdByToolName: Record<string, number>;
};

export type ModelPrice = {
  modelIdentifier: string;
  inputPricePerMillionTokens: number;
  outputPricePerMillionTokens: number;
  cacheWriteMultiplier: number;            // 1.25 for the 5-minute cache
  cacheReadMultiplier: number;             // 0.10
  verifiedOn: string;                      // ISO date; shown in reports
};

// runtime.ts  (implemented by WP-02, called by adapters)
export type ToolSelectionOutcome = {
  toolNamesToSend: Array<string>;          // shadow: always all tools
  decisionRecord: DecisionRecord;
};

export type RiskGateVerdict = 'allow' | 'askHuman' | 'block';
export type RiskGateOutcome = {
  verdictToApply: RiskGateVerdict | null;  // null in shadow mode: host behaves as before
  suggestedVerdict: RiskGateVerdict;
  decisionRecord: DecisionRecord;
};

export type RunHandle = {
  runIdentifier: string;
  decideToolSelection: (stepContext: StepContext) => Promise<ToolSelectionOutcome>;
  checkToolCallRisk: (pendingToolCall: PendingToolCall) => Promise<RiskGateOutcome>;
  recordStep: (stepTrace: Omit<AgentStepTrace, 'traceSchemaVersion' | 'projectName' | 'recordedAt'>) => void;
  finishRun: (runSummary: Omit<RunSummaryTrace, 'traceSchemaVersion' | 'recordType' | 'projectName' | 'recordedAt'>) => Promise<void>;
};

export type KrinoRuntime = {
  startRun: (runStart: { hostName: HostName; hostSdkVersion: string; capabilities: HostCapabilities }) => RunHandle;
  flushAll: (timeoutInMilliseconds: number) => Promise<void>;
};

export declare function createKrino(krinoConfig: KrinoConfig): KrinoRuntime;
```

> The signatures above are the target. WP-01 may fix small errors (for example a missing field), but must list every change in its PR description.
