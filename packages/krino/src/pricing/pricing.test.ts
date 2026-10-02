import { describe, expect, it } from "vitest";
import type { ModelPrice } from "../contracts/index.js";
import { canonicalModelIdentifier, findModelPrice, mergeModelPrices } from "./find-model-price.js";
import { DEFAULT_MODEL_PRICES } from "./price-table.js";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

describe("DEFAULT_MODEL_PRICES", () => {
  it("has the current Claude Haiku, Sonnet and Opus models and Jev", () => {
    expect(DEFAULT_MODEL_PRICES.map((modelPrice) => modelPrice.modelIdentifier)).toEqual([
      "claude-opus-5-5",
      "claude-sonnet-5-5",
      "claude-haiku-4-5",
      "typesafe-ai/jev",
    ]);
  });

  it("gives every price an ISO verifiedOn date and non-negative numbers", () => {
    for (const modelPrice of DEFAULT_MODEL_PRICES) {
      expect(modelPrice.verifiedOn).toMatch(ISO_DATE_PATTERN);
      expect(modelPrice.inputPricePerMillionTokens).toBeGreaterThanOrEqual(0);
      expect(modelPrice.outputPricePerMillionTokens).toBeGreaterThanOrEqual(0);
      expect(modelPrice.cacheWriteMultiplier).toBeGreaterThanOrEqual(0);
      expect(modelPrice.cacheReadMultiplier).toBeGreaterThanOrEqual(0);
    }
  });

  it("is frozen", () => {
    expect(Object.isFrozen(DEFAULT_MODEL_PRICES)).toBe(true);
    for (const modelPrice of DEFAULT_MODEL_PRICES) {
      expect(Object.isFrozen(modelPrice)).toBe(true);
    }
  });
});

describe("canonicalModelIdentifier", () => {
  it.each([
    ["claude-sonnet-5-5", "claude-sonnet-5-5"],
    ["anthropic/claude-sonnet-5.5", "claude-sonnet-5-5"],
    ["anthropic.claude-sonnet-5-5", "claude-sonnet-5-5"],
    ["claude-haiku-4-5-20251001", "claude-haiku-4-5"],
    ["claude-opus-4-5@20251101", "claude-opus-4-5"],
    ["  Claude-Opus-5-5 ", "claude-opus-5-5"],
    ["typesafe-ai/jev", "jev"],
  ])("%s → %s", (modelIdentifier, expectedIdentifier) => {
    expect(canonicalModelIdentifier(modelIdentifier)).toBe(expectedIdentifier);
  });
});

describe("findModelPrice", () => {
  it("finds exact and host-specific spellings", () => {
    expect(findModelPrice("claude-sonnet-5-5", DEFAULT_MODEL_PRICES)?.modelIdentifier).toBe(
      "claude-sonnet-5-5",
    );
    expect(
      findModelPrice("anthropic/claude-haiku-4.5", DEFAULT_MODEL_PRICES)?.modelIdentifier,
    ).toBe("claude-haiku-4-5");
    expect(findModelPrice("jev", DEFAULT_MODEL_PRICES)?.modelIdentifier).toBe("typesafe-ai/jev");
  });

  it("does not match a different model of the same family", () => {
    expect(findModelPrice("claude-opus-5", DEFAULT_MODEL_PRICES)).toBeNull();
    expect(findModelPrice("claude-sonnet-5", DEFAULT_MODEL_PRICES)).toBeNull();
  });

  it("returns null for an unknown model", () => {
    expect(findModelPrice("gpt-unknown", DEFAULT_MODEL_PRICES)).toBeNull();
  });
});

describe("mergeModelPrices", () => {
  it("lets overrides replace table rows with the same model", () => {
    const override: ModelPrice = {
      modelIdentifier: "anthropic/claude-sonnet-5.5",
      inputPricePerMillionTokens: 1.5,
      outputPricePerMillionTokens: 7,
      cacheWriteMultiplier: 1.25,
      cacheReadMultiplier: 0.1,
      verifiedOn: "2026-10-01",
    };
    const mergedPrices = mergeModelPrices(DEFAULT_MODEL_PRICES, [override]);
    expect(mergedPrices).toHaveLength(DEFAULT_MODEL_PRICES.length);
    expect(findModelPrice("claude-sonnet-5-5", mergedPrices)).toBe(override);
  });

  it("adds overrides for models the table does not have", () => {
    const override: ModelPrice = {
      modelIdentifier: "custom-model",
      inputPricePerMillionTokens: 1,
      outputPricePerMillionTokens: 1,
      cacheWriteMultiplier: 1,
      cacheReadMultiplier: 1,
      verifiedOn: "2026-10-01",
    };
    expect(mergeModelPrices(DEFAULT_MODEL_PRICES, [override])).toHaveLength(
      DEFAULT_MODEL_PRICES.length + 1,
    );
  });
});
