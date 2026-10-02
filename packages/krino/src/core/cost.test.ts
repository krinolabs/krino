import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { ModelPrice, TokenUsageRecord } from "../contracts/index.js";
import { DEFAULT_MODEL_PRICES } from "../pricing/index.js";
import { costFromUsage, estimateDecisionCostInUsd } from "./cost.js";

const sonnetLikePrice: ModelPrice = {
  modelIdentifier: "test-sonnet",
  inputPricePerMillionTokens: 3,
  outputPricePerMillionTokens: 15,
  cacheWriteMultiplier: 1.25,
  cacheReadMultiplier: 0.1,
  verifiedOn: "2026-10-02",
};

function usage(usageFields: Partial<TokenUsageRecord>): TokenUsageRecord {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    ...usageFields,
  };
}

describe("costFromUsage", () => {
  it("prices input and output tokens per million", () => {
    expect(costFromUsage(usage({ inputTokens: 1_000_000 }), sonnetLikePrice)).toBeCloseTo(3);
    expect(costFromUsage(usage({ outputTokens: 1_000_000 }), sonnetLikePrice)).toBeCloseTo(15);
  });

  it("includes cache write tokens at the write multiplier", () => {
    expect(costFromUsage(usage({ cacheWriteTokens: 1_000_000 }), sonnetLikePrice)).toBeCloseTo(
      3.75,
    );
  });

  it("includes cache read tokens at the read multiplier", () => {
    expect(costFromUsage(usage({ cacheReadTokens: 1_000_000 }), sonnetLikePrice)).toBeCloseTo(0.3);
  });

  it("adds all four parts", () => {
    const mixedUsage = usage({
      inputTokens: 2_000,
      outputTokens: 500,
      cacheReadTokens: 10_000,
      cacheWriteTokens: 4_000,
    });
    const expectedCost = (2_000 * 3 + 500 * 15 + 10_000 * 0.3 + 4_000 * 3.75) / 1_000_000;
    expect(costFromUsage(mixedUsage, sonnetLikePrice)).toBeCloseTo(expectedCost, 12);
  });

  it("treats negative and non-finite counts and prices as zero", () => {
    expect(
      costFromUsage(usage({ inputTokens: -5, outputTokens: Number.NaN }), sonnetLikePrice),
    ).toBe(0);
    expect(
      costFromUsage(usage({ inputTokens: 1_000_000 }), {
        ...sonnetLikePrice,
        inputPricePerMillionTokens: Number.POSITIVE_INFINITY,
      }),
    ).toBe(0);
  });

  it("property: cost and estimated decision cost are never negative and never NaN", () => {
    const anyNumber = fc.oneof(
      fc.double(),
      fc.integer({ min: -1_000_000_000, max: 1_000_000_000 }),
      fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -0),
    );
    fc.assert(
      fc.property(
        fc.record({
          inputTokens: anyNumber,
          outputTokens: anyNumber,
          cacheReadTokens: anyNumber,
          cacheWriteTokens: anyNumber,
        }),
        fc.record({
          inputPricePerMillionTokens: anyNumber,
          outputPricePerMillionTokens: anyNumber,
          cacheWriteMultiplier: anyNumber,
          cacheReadMultiplier: anyNumber,
        }),
        anyNumber,
        anyNumber,
        (tokenUsage, priceFields, sentCharacterCount, answerCharacterCount) => {
          const modelPrice = { ...priceFields, modelIdentifier: "any", verifiedOn: "2026-10-02" };
          const computedCost = costFromUsage(tokenUsage, modelPrice);
          const estimatedDecisionCost = estimateDecisionCostInUsd({
            sentCharacterCount,
            answerCharacterCount,
            modelPrice,
          });
          return (
            computedCost >= 0 &&
            !Number.isNaN(computedCost) &&
            estimatedDecisionCost >= 0 &&
            !Number.isNaN(estimatedDecisionCost)
          );
        },
      ),
    );
  });

  it("property: more cache tokens never lower the cost", () => {
    const tokenCount = fc.integer({ min: 0, max: 10_000_000 });
    fc.assert(
      fc.property(tokenCount, tokenCount, tokenCount, (inputTokens, cacheTokens, extraTokens) => {
        const baseCost = costFromUsage(
          usage({ inputTokens, cacheReadTokens: cacheTokens, cacheWriteTokens: cacheTokens }),
          sonnetLikePrice,
        );
        const moreCacheCost = costFromUsage(
          usage({
            inputTokens,
            cacheReadTokens: cacheTokens + extraTokens,
            cacheWriteTokens: cacheTokens + extraTokens,
          }),
          sonnetLikePrice,
        );
        return moreCacheCost >= baseCost;
      }),
    );
  });
});

describe("estimateDecisionCostInUsd (estimated in v0.1)", () => {
  it("prices characters sent ÷ 4 as input and answer characters ÷ 4 as output", () => {
    expect(
      estimateDecisionCostInUsd({
        sentCharacterCount: 4_000_000,
        answerCharacterCount: 400_000,
        modelPrice: sonnetLikePrice,
      }),
    ).toBeCloseTo((1_000_000 * 3 + 100_000 * 15) / 1_000_000, 12);
  });

  it("rounds partial tokens up", () => {
    expect(
      estimateDecisionCostInUsd({
        sentCharacterCount: 10,
        answerCharacterCount: 5,
        modelPrice: sonnetLikePrice,
      }),
    ).toBeCloseTo((3 * 3 + 2 * 15) / 1_000_000, 15);
  });

  it("charges no output for Jev", () => {
    const jevPrice = DEFAULT_MODEL_PRICES.find(
      (modelPrice) => modelPrice.modelIdentifier === "typesafe-ai/jev",
    );
    expect(jevPrice).toBeDefined();
    if (jevPrice === undefined) {
      return;
    }
    expect(
      estimateDecisionCostInUsd({
        sentCharacterCount: 4_000_000,
        answerCharacterCount: 4_000_000,
        modelPrice: jevPrice,
      }),
    ).toBeCloseTo(0.042, 12);
  });

  it("is zero when nothing was sent or answered", () => {
    expect(
      estimateDecisionCostInUsd({
        sentCharacterCount: 0,
        answerCharacterCount: 0,
        modelPrice: sonnetLikePrice,
      }),
    ).toBe(0);
  });
});
