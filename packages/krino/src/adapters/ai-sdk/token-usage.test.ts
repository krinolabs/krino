import type { LanguageModelUsage, ProviderMetadata } from "ai";
import { describe, expect, it } from "vitest";
import usageFixture from "./fixtures/anthropic-usage-with-cache.json" with { type: "json" };
import { addTokenUsage, EMPTY_TOKEN_USAGE, tokenUsageFromStep } from "./token-usage.js";

/** The step usage ai 7.0.126 builds from provider usage (`asLanguageModelUsage` in ai). */
function stepUsageFromFixture(): LanguageModelUsage {
  const providerUsage = usageFixture.usage;
  return {
    inputTokens: providerUsage.inputTokens.total,
    inputTokenDetails: {
      noCacheTokens: providerUsage.inputTokens.noCache,
      cacheReadTokens: providerUsage.inputTokens.cacheRead,
      cacheWriteTokens: providerUsage.inputTokens.cacheWrite,
    },
    outputTokens: providerUsage.outputTokens.total,
    outputTokenDetails: {
      textTokens: providerUsage.outputTokens.text,
      reasoningTokens: providerUsage.outputTokens.reasoning,
    },
    totalTokens: providerUsage.inputTokens.total + providerUsage.outputTokens.total,
    raw: providerUsage.raw,
  };
}

function emptyStepUsage(): LanguageModelUsage {
  return {
    inputTokens: undefined,
    inputTokenDetails: {
      noCacheTokens: undefined,
      cacheReadTokens: undefined,
      cacheWriteTokens: undefined,
    },
    outputTokens: undefined,
    outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined },
    totalTokens: undefined,
  };
}

describe("tokenUsageFromStep", () => {
  it("cache fixture: inputTokens excludes cache read and cache write tokens", () => {
    const stepUsage = stepUsageFromFixture();
    const providerMetadata: ProviderMetadata = usageFixture.providerMetadata;

    const tokenUsage = tokenUsageFromStep(stepUsage, providerMetadata);

    expect(usageFixture.usage.inputTokens.cacheRead).toBeGreaterThan(0);
    expect(usageFixture.usage.inputTokens.cacheWrite).toBeGreaterThan(0);
    expect(tokenUsage).toEqual(usageFixture.expectedTokenUsage);
    // No double billing: the three input buckets add up to the host's total, not more.
    expect(tokenUsage.inputTokens + tokenUsage.cacheReadTokens + tokenUsage.cacheWriteTokens).toBe(
      stepUsage.inputTokens,
    );
  });

  it("subtracts cache tokens from the total when the provider reports no noCache count", () => {
    const stepUsage = stepUsageFromFixture();
    stepUsage.inputTokenDetails.noCacheTokens = undefined;

    expect(tokenUsageFromStep(stepUsage, undefined)).toEqual(usageFixture.expectedTokenUsage);
  });

  it("never reports negative input tokens when cache counts exceed the total", () => {
    const stepUsage = stepUsageFromFixture();
    stepUsage.inputTokens = 100;
    stepUsage.inputTokenDetails.noCacheTokens = undefined;

    expect(tokenUsageFromStep(stepUsage, undefined).inputTokens).toBe(0);
  });

  it("falls back to Anthropic's raw usage fields when the details are missing", () => {
    const stepUsage = stepUsageFromFixture();
    stepUsage.inputTokenDetails = {
      noCacheTokens: undefined,
      cacheReadTokens: undefined,
      cacheWriteTokens: undefined,
    };

    expect(tokenUsageFromStep(stepUsage, undefined)).toEqual(usageFixture.expectedTokenUsage);
  });

  it("falls back to Anthropic provider metadata for cache writes", () => {
    const stepUsage = stepUsageFromFixture();
    stepUsage.inputTokenDetails.cacheWriteTokens = undefined;
    stepUsage.raw = {};

    expect(tokenUsageFromStep(stepUsage, usageFixture.providerMetadata).cacheWriteTokens).toBe(200);
  });

  it("reads zeros when the host reports nothing", () => {
    expect(tokenUsageFromStep(emptyStepUsage(), undefined)).toEqual(EMPTY_TOKEN_USAGE);
  });

  it("ignores counts that are not finite, non-negative numbers", () => {
    const stepUsage = emptyStepUsage();
    stepUsage.inputTokens = Number.NaN;
    stepUsage.outputTokens = -5;
    stepUsage.raw = { cache_read_input_tokens: "12" };

    expect(
      tokenUsageFromStep(stepUsage, { anthropic: { cacheCreationInputTokens: null } }),
    ).toEqual(EMPTY_TOKEN_USAGE);
  });

  it("does not read inherited properties from provider metadata", () => {
    const stepUsage = emptyStepUsage();
    const inheritedMetadata = Object.create({ anthropic: { cacheCreationInputTokens: 9 } });

    expect(tokenUsageFromStep(stepUsage, inheritedMetadata).cacheWriteTokens).toBe(0);
  });
});

describe("addTokenUsage", () => {
  it("adds every bucket", () => {
    expect(
      addTokenUsage(
        { inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 4 },
        { inputTokens: 10, outputTokens: 20, cacheReadTokens: 30, cacheWriteTokens: 40 },
      ),
    ).toEqual({ inputTokens: 11, outputTokens: 22, cacheReadTokens: 33, cacheWriteTokens: 44 });
  });
});
