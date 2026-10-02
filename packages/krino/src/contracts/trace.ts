import type { DecisionKind, DecisionMode, DecisionStatus } from "./decisions.js";
import type { HostName } from "./host.js";

export const TRACE_SCHEMA_VERSION = 1 as const;

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
  /** ISO 8601 */
  recordedAt: string;
};
