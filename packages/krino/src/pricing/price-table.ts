import type { ModelPrice } from "../contracts/index.js";
import {
  DEFAULT_CACHE_READ_MULTIPLIER,
  DEFAULT_CACHE_WRITE_MULTIPLIER,
} from "../contracts/index.js";

// VERIFY BEFORE RELEASE: every price below. Prices change; reports show `verifiedOn`.
// Claude prices: Anthropic first-party API rates. Jev: Vercel AI Gateway model page.

/** Claude Opus 5.5 reads cache at 0.05× base input, not the usual 0.1×. */
const CLAUDE_OPUS_5_5_CACHE_READ_MULTIPLIER = 0.05;

/** Jev publishes no cache pricing, so cache tokens are priced as plain input. */
const NO_CACHE_DISCOUNT_MULTIPLIER = 1;

export const DEFAULT_MODEL_PRICES: ReadonlyArray<Readonly<ModelPrice>> = Object.freeze([
  Object.freeze({
    modelIdentifier: "claude-opus-5-5",
    inputPricePerMillionTokens: 4,
    outputPricePerMillionTokens: 20,
    cacheWriteMultiplier: DEFAULT_CACHE_WRITE_MULTIPLIER,
    cacheReadMultiplier: CLAUDE_OPUS_5_5_CACHE_READ_MULTIPLIER,
    verifiedOn: "2026-10-02",
  }),
  Object.freeze({
    modelIdentifier: "claude-sonnet-5-5",
    inputPricePerMillionTokens: 2,
    outputPricePerMillionTokens: 10,
    cacheWriteMultiplier: DEFAULT_CACHE_WRITE_MULTIPLIER,
    cacheReadMultiplier: DEFAULT_CACHE_READ_MULTIPLIER,
    verifiedOn: "2026-10-02",
  }),
  Object.freeze({
    modelIdentifier: "claude-haiku-4-5",
    inputPricePerMillionTokens: 1,
    outputPricePerMillionTokens: 5,
    cacheWriteMultiplier: DEFAULT_CACHE_WRITE_MULTIPLIER,
    cacheReadMultiplier: DEFAULT_CACHE_READ_MULTIPLIER,
    verifiedOn: "2026-10-02",
  }),
  Object.freeze({
    modelIdentifier: "typesafe-ai/jev",
    inputPricePerMillionTokens: 0.042,
    outputPricePerMillionTokens: 0,
    cacheWriteMultiplier: NO_CACHE_DISCOUNT_MULTIPLIER,
    cacheReadMultiplier: NO_CACHE_DISCOUNT_MULTIPLIER,
    verifiedOn: "2026-10-02",
  }),
]);
