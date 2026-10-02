// The stub runtime is not re-exported here; adapters import it from './stub-runtime.js'
// so it never reaches the public package entry point.

export type { KrinoConfig, ModelPrice, RiskGatePolicy } from "./config.js";
export type {
  DecisionAnswer,
  DecisionKind,
  DecisionMode,
  DecisionQuestion,
  DecisionStatus,
  FailureRule,
} from "./decisions.js";
export {
  DEFAULT_CACHE_READ_MULTIPLIER,
  DEFAULT_CACHE_WRITE_MULTIPLIER,
  DEFAULT_CONTEXT_SAFETY_MARGIN_RATIO,
  DEFAULT_DECISION_CONTEXT_BUDGET_IN_TOKENS,
  DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS,
  KRINO_CONFIG_DEFAULTS,
  type KrinoConfigDefaults,
} from "./defaults.js";
export { DecisionProviderError, DecisionTimeoutError, KrinoConfigurationError } from "./errors.js";
export type {
  HostCapabilities,
  HostName,
  PendingToolCall,
  StepContext,
  ToolDescription,
  ToolSelectionTiming,
} from "./host.js";
export type { DecisionProvider, DecisionRequestOptions } from "./provider.js";
export type {
  CreateKrino,
  KrinoRuntime,
  RiskGateOutcome,
  RiskGateVerdict,
  RunHandle,
  RunStartOptions,
  RunSummaryInput,
  StepTraceInput,
  ToolSelectionOutcome,
} from "./runtime.js";
export type { TraceSink } from "./sink.js";
export {
  type AgentStepTrace,
  type DecisionRecord,
  type RunSummaryTrace,
  type TokenUsageRecord,
  TRACE_SCHEMA_VERSION,
} from "./trace.js";
