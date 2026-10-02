import type { KrinoConfig } from "./config.js";
import type { HostCapabilities, HostName, PendingToolCall, StepContext } from "./host.js";
import type { AgentStepTrace, DecisionRecord, RunSummaryTrace } from "./trace.js";

// Implemented by WP-02, called by adapters.

export type ToolSelectionOutcome = {
  /** Shadow mode: always all tools. */
  toolNamesToSend: Array<string>;
  decisionRecord: DecisionRecord;
};

export type RiskGateVerdict = "allow" | "askHuman" | "block";

export type RiskGateOutcome = {
  /** `null` in shadow mode: the host behaves as before. */
  verdictToApply: RiskGateVerdict | null;
  suggestedVerdict: RiskGateVerdict;
  decisionRecord: DecisionRecord;
};

export type RunStartOptions = {
  hostName: HostName;
  hostSdkVersion: string;
  capabilities: HostCapabilities;
};

/** What an adapter passes to `recordStep`; the runtime fills the rest. */
export type StepTraceInput = Omit<
  AgentStepTrace,
  "traceSchemaVersion" | "recordType" | "projectName" | "recordedAt"
>;

/** What an adapter passes to `finishRun`; the runtime fills the rest. */
export type RunSummaryInput = Omit<
  RunSummaryTrace,
  "traceSchemaVersion" | "recordType" | "projectName" | "recordedAt"
>;

export type RunHandle = {
  runIdentifier: string;
  decideToolSelection: (stepContext: StepContext) => Promise<ToolSelectionOutcome>;
  checkToolCallRisk: (pendingToolCall: PendingToolCall) => Promise<RiskGateOutcome>;
  recordStep: (stepTrace: StepTraceInput) => void;
  finishRun: (runSummary: RunSummaryInput) => Promise<void>;
};

export type KrinoRuntime = {
  startRun: (runStart: RunStartOptions) => RunHandle;
  flushAll: (timeoutInMilliseconds: number) => Promise<void>;
};

/** Signature of `createKrino`, implemented in `core/` (WP-02). */
export type CreateKrino = (krinoConfig: KrinoConfig) => KrinoRuntime;
