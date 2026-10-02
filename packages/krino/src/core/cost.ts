import type { ModelPrice, TokenUsageRecord } from "../contracts/index.js";
import { estimateTokensFromCharacters } from "./context-budget.js";

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

export type DecisionCostEstimateInput = {
  /** Characters of everything sent to the provider. */
  sentCharacterCount: number;
  /** Characters of the answers' choices; 0 when there was no answer. */
  answerCharacterCount: number;
  /** Price of the decision model. */
  modelPrice: ModelPrice;
};

/**
 * Estimated cost of one decision request: (characters sent ÷ 4) × input price, plus
 * (answer characters ÷ 4) × output price. Providers report no token usage, so v0.1 estimates.
 */
export function estimateDecisionCostInUsd(costEstimateInput: DecisionCostEstimateInput): number {
  return costFromUsage(
    {
      inputTokens: estimateTokensFromCharacters(costEstimateInput.sentCharacterCount),
      outputTokens: estimateTokensFromCharacters(costEstimateInput.answerCharacterCount),
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
    costEstimateInput.modelPrice,
  );
}

/** Zero tokens cost nothing, even at an overflowed (infinite) price: avoids `0 × Infinity = NaN`. */
function tokenCost(tokenCount: number, pricePerMillionTokens: number): number {
  const countedTokens = nonNegativeOrZero(tokenCount);
  return countedTokens === 0 ? 0 : countedTokens * pricePerMillionTokens;
}
