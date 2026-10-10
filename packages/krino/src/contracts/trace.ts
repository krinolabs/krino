import type { DecisionKind, DecisionMode, DecisionStatus } from "./decisions.js";
import type { HostName } from "./host.js";

/** The version krino writes. Version 2 added `routingCounterfactualCostInUsd` and `runOutcome`. */
export const TRACE_SCHEMA_VERSION = 2 as const;

/** Versions a trace reader accepts. */
export type TraceSchemaVersion = 1 | typeof TRACE_SCHEMA_VERSION;

/** Readers accept these. Version 1 run summaries lack the version 2 fields; read them as `null`. */
export const SUPPORTED_TRACE_SCHEMA_VERSIONS: ReadonlyArray<TraceSchemaVersion> = Object.freeze([
  1,
  TRACE_SCHEMA_VERSION,
]);

export type TokenUsageRecord = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

/**
 * Choice encoding for `suggestedChoice` and `appliedChoice`:
 * - `toolSelection`: tool names, sorted, joined with `,` (for example `"readFile,search"`).
 * - `riskGate`: a `RiskGateVerdict` (`"allow"`, `"askHuman"` or `"block"`).
 * - `modelRouting`: the model identifier as the host names it (for example
 *   `"anthropic/claude-haiku-4-5"`).
 */
export type DecisionRecord = {
  decisionKind: DecisionKind;
  decisionMode: DecisionMode;
  decisionStatus: DecisionStatus;
  suggestedChoice: string | null;
  /** What the agent actually used. */
  appliedChoice: string | null;
  probability: number | null;
  decisionModelVersion: string | null;
  latencyInMilliseconds: number | null;
  /** Estimated in v0.1. */
  decisionCostInUsd: number | null;
};

export type AgentStepTrace = {
  traceSchemaVersion: typeof TRACE_SCHEMA_VERSION;
  recordType: "agentStep";
  projectName: string;
  runIdentifier: string;
  stepNumber: number;
  hostName: HostName;
  hostSdkVersion: string;
  modelIdentifier: string;
  availableToolNames: Array<string>;
  chosenToolNames: Array<string>;
  /** `null` when the host reports usage per run only. */
  tokenUsage: TokenUsageRecord | null;
  costInUsd: number | null;
  latencyInMilliseconds: number | null;
  /** ISO 8601 */
  recordedAt: string;
  decisions: Array<DecisionRecord>;
  contentHash: string | null;
};

/** How a run ended, as the host reports it. */
export type RunOutcome = "completed" | "aborted" | "error";

export type RunSummaryTrace = {
  traceSchemaVersion: typeof TRACE_SCHEMA_VERSION;
  recordType: "runSummary";
  projectName: string;
  runIdentifier: string;
  hostName: HostName;
  hostSdkVersion: string;
  /** The main model of the run. */
  modelIdentifier: string;
  totalTokenUsage: TokenUsageRecord;
  totalCostInUsd: number;
  stepCount: number;
  usedToolNames: Array<string>;
  /**
   * `true` when every used tool is inside the suggested tool set.
   * `null` when there was no suggestion or the host does not compute it.
   */
  toolSelectionAgreement: boolean | null;
  /**
   * The run's total usage priced at the other model: the suggested model in shadow mode, the
   * fallback model in enforce mode. An estimate. `null` without a routing decision or a known
   * price. Filled by the runtime.
   */
  routingCounterfactualCostInUsd: number | null;
  /** `null` when the host does not say. */
  runOutcome: RunOutcome | null;
  /** ISO 8601 */
  recordedAt: string;
};
