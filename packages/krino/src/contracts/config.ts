import type { DecisionKind, DecisionMode } from "./decisions.js";
import type { DecisionProvider } from "./provider.js";
import type { TraceSink } from "./sink.js";

export type KrinoConfig = {
  projectName: string;
  /** Default: every decision kind in `'shadow'`. */
  decisionModes: Partial<Record<DecisionKind, DecisionMode>>;
  /** Default 0.8. */
  minimumConfidence?: number;
  /** Default 800. */
  decisionTimeoutInMilliseconds?: number;
  /** Default 0.05. Used in enforce mode only. */
  explorationRate?: number;
  riskGatePolicy?: RiskGatePolicy;
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
