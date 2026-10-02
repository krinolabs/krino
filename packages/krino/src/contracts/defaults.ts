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
