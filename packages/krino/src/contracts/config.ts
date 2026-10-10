import type { DecisionKind, DecisionMode } from "./decisions.js";
import type { DecisionProvider } from "./provider.js";
import type { TraceSink } from "./sink.js";

export type KrinoConfig = {
  projectName: string;
  /**
   * Default: every decision kind in `'shadow'`. Model routing needs a `modelRoutingPolicy`;
   * without one it does nothing.
   */
  decisionModes: Partial<Record<DecisionKind, DecisionMode>>;
  /** Default 0.8. Used by tool selection and model routing. */
  minimumConfidence?: number;
  /** Default 800. */
  decisionTimeoutInMilliseconds?: number;
  /** Default 0.05. Used in enforce mode only. */
  explorationRate?: number;
  riskGatePolicy?: RiskGatePolicy;
  /** Without it, model routing is off. */
  modelRoutingPolicy?: ModelRoutingPolicy;
  /** Default: the fake provider, with a warning. */
  decisionProvider?: DecisionProvider;
  /** Default: the file sink. */
  traceSink?: TraceSink;
  /** Default true. */
  redactContent?: boolean;
  priceOverrides?: Array<ModelPrice>;
  /** Injectable for tests. */
  randomSource?: () => number;
};

export type RiskGatePolicy = {
  blockedToolNames: Array<string>;
  alwaysAllowedToolNames: Array<string>;
  allowThresholdByToolName: Record<string, number>;
};

export type ModelCandidate = {
  /**
   * As the host names it: a Pi `provider/id`, or an AI SDK model id such as
   * `"anthropic/claude-haiku-4.5"`.
   */
  modelIdentifier: string;
  /** One line sent to the decision model: when this model is enough. */
  useWhen: string;
};

export type ModelRoutingPolicy = {
  /** 2 to 4 candidates with unique identifiers. */
  candidateModels: Array<ModelCandidate>;
  /**
   * One of the candidates. Used on timeout, error, low confidence, an answer that names no
   * available candidate, and exploration.
   */
  fallbackModelIdentifier: string;
};

export type ModelPrice = {
  modelIdentifier: string;
  inputPricePerMillionTokens: number;
  outputPricePerMillionTokens: number;
  /** 1.25 for the 5-minute cache. */
  cacheWriteMultiplier: number;
  /** 0.10 */
  cacheReadMultiplier: number;
  /** ISO date; shown in reports. */
  verifiedOn: string;
};
