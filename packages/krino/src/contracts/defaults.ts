import type { DecisionKind, DecisionMode } from "./decisions.js";

export type KrinoConfigDefaults = {
  decisionModes: Readonly<Record<DecisionKind, DecisionMode>>;
  minimumConfidence: number;
  decisionTimeoutInMilliseconds: number;
  explorationRate: number;
  redactContent: boolean;
};

/** Values `createKrino` uses when a `KrinoConfig` field is missing. */
export const KRINO_CONFIG_DEFAULTS: Readonly<KrinoConfigDefaults> = Object.freeze({
  decisionModes: Object.freeze({ toolSelection: "shadow", riskGate: "shadow" }),
  minimumConfidence: 0.8,
  decisionTimeoutInMilliseconds: 800,
  explorationRate: 0.05,
  redactContent: true,
});

/** `ModelPrice.cacheWriteMultiplier` for the 5-minute cache. */
export const DEFAULT_CACHE_WRITE_MULTIPLIER = 1.25;

/** `ModelPrice.cacheReadMultiplier`. */
export const DEFAULT_CACHE_READ_MULTIPLIER = 0.1;

/** How long `finishRun` and `flushAll` wait for pending decisions before writing `cutOff`. */
export const DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS = 2000;

/** Token budget for the context sent to a decision provider. */
export const DEFAULT_DECISION_CONTEXT_BUDGET_IN_TOKENS = 32000;

/** Share of the context budget kept free, because tokens are estimated as characters ÷ 4. */
export const DEFAULT_CONTEXT_SAFETY_MARGIN_RATIO = 0.1;
