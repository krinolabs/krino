import type { KrinoConfig, ModelPrice } from "./config.js";
import type {
  HostCapabilities,
  HostName,
  ModelRouteContext,
  PendingToolCall,
  StepContext,
} from "./host.js";
import type { AgentStepTrace, DecisionRecord, RunOutcome, RunSummaryTrace } from "./trace.js";

// Implemented by WP-02, called by adapters.

export type ToolSelectionOutcome = {
  /** Shadow mode: always all tools. */
  toolNamesToSend: Array<string>;
  decisionRecord: DecisionRecord;
};

export type ModelRouteOutcome = {
  /** Shadow mode: always `hostModelIdentifier`. */
  modelIdentifierToUse: string;
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
  /**
   * Prices the host knows (for example Pi's model catalog). Used after `priceOverrides` and
   * before krino's own price table.
   */
  hostModelPrices?: Array<ModelPrice>;
};

/** What an adapter passes to `recordStep`; the runtime fills the rest. */
export type StepTraceInput = Omit<
  AgentStepTrace,
  "traceSchemaVersion" | "recordType" | "projectName" | "recordedAt"
>;

/** What an adapter passes to `finishRun`; the runtime fills the rest. */
export type RunSummaryInput = Omit<
  RunSummaryTrace,
  | "traceSchemaVersion"
  | "recordType"
  | "projectName"
  | "recordedAt"
  | "routingCounterfactualCostInUsd"
  | "runOutcome"
> & {
  /** Default `null`: the host did not say how the run ended. */
  runOutcome?: RunOutcome | null;
};

export type RunHandle = {
  runIdentifier: string;
  decideToolSelection: (stepContext: StepContext) => Promise<ToolSelectionOutcome>;
  /** Call on the first request of a run; later calls in the run return the same model. */
  decideModelRoute: (modelRouteContext: ModelRouteContext) => Promise<ModelRouteOutcome>;
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
