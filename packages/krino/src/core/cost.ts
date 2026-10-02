import type { ModelPrice, TokenUsageRecord } from "../contracts/index.js";

const TOKENS_PER_MILLION = 1_000_000;

/** Negative, NaN and infinite counts or prices count as 0, so a cost is never negative. */
function nonNegativeOrZero(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Cost of one usage record in USD, including cache reads and writes.
 *
 * `inputTokens` must exclude cache tokens (Anthropic's `input_tokens` convention).
 * Adapters whose host counts cache tokens inside the input total subtract them first.
 */
export function costFromUsage(tokenUsage: TokenUsageRecord, modelPrice: ModelPrice): number {
  const inputPrice = nonNegativeOrZero(modelPrice.inputPricePerMillionTokens);
  const outputPrice = nonNegativeOrZero(modelPrice.outputPricePerMillionTokens);
  const cacheWritePrice = inputPrice * nonNegativeOrZero(modelPrice.cacheWriteMultiplier);
  const cacheReadPrice = inputPrice * nonNegativeOrZero(modelPrice.cacheReadMultiplier);

  const costPerMillion =
    tokenCost(tokenUsage.inputTokens, inputPrice) +
    tokenCost(tokenUsage.outputTokens, outputPrice) +
    tokenCost(tokenUsage.cacheWriteTokens, cacheWritePrice) +
    tokenCost(tokenUsage.cacheReadTokens, cacheReadPrice);

  return costPerMillion / TOKENS_PER_MILLION;
}

/** Zero tokens cost nothing, even at an overflowed (infinite) price: avoids `0 × Infinity = NaN`. */
function tokenCost(tokenCount: number, pricePerMillionTokens: number): number {
  const countedTokens = nonNegativeOrZero(tokenCount);
  return countedTokens === 0 ? 0 : countedTokens * pricePerMillionTokens;
}
