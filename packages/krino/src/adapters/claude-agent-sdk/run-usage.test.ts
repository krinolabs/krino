import { describe, expect, it } from "vitest";
import { mainModelIdentifier, totalTokenUsageFrom } from "./run-usage.js";
import { modelUsage, PROTOTYPE_KEY_NAMES } from "./test-support.js";

describe("totalTokenUsageFrom", () => {
  it("sums every model, including cache read and cache write tokens", () => {
    expect(
      totalTokenUsageFrom({
        "claude-haiku-4-5": modelUsage({
          inputTokens: 100,
          outputTokens: 50,
          cacheReadInputTokens: 2_000,
          cacheCreationInputTokens: 300,
        }),
        "claude-sonnet-5-5": modelUsage({
          inputTokens: 10,
          outputTokens: 5,
          cacheReadInputTokens: 20,
          cacheCreationInputTokens: 30,
        }),
      }),
    ).toEqual({
      inputTokens: 110,
      outputTokens: 55,
      cacheReadTokens: 2_020,
      cacheWriteTokens: 330,
    });
  });

  it("is zero without usage and skips counts that are not finite, non-negative numbers", () => {
    const zeroUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
    expect(totalTokenUsageFrom(undefined)).toEqual(zeroUsage);
    expect(totalTokenUsageFrom(null)).toEqual(zeroUsage);
    expect(totalTokenUsageFrom("usage")).toEqual(zeroUsage);
    expect(
      totalTokenUsageFrom({
        broken: { inputTokens: "12", outputTokens: Number.NaN, cacheReadInputTokens: -4 },
        alsoBroken: null,
        fine: modelUsage({ inputTokens: 7 }),
      }),
    ).toEqual({ ...zeroUsage, inputTokens: 7 });
  });

  it("handles prototype-key model names", () => {
    // Object.fromEntries makes "__proto__" an own key.
    const usageByModel = Object.fromEntries(
      PROTOTYPE_KEY_NAMES.map((modelName) => [modelName, modelUsage({ inputTokens: 1 })]),
    );
    expect(Object.hasOwn(usageByModel, "__proto__")).toBe(true);
    expect(totalTokenUsageFrom(usageByModel).inputTokens).toBe(3);
  });
});

describe("mainModelIdentifier", () => {
  const usageByModel = {
    "claude-haiku-4-5": modelUsage({ inputTokens: 900 }),
    // Fewer uncached tokens, but more input once cache reads and writes count.
    "claude-sonnet-5-5": modelUsage({
      inputTokens: 50,
      cacheReadInputTokens: 800,
      cacheCreationInputTokens: 100,
    }),
  };

  it("is the model option passed to query() when there is one", () => {
    expect(mainModelIdentifier("claude-opus-5-5", usageByModel)).toBe("claude-opus-5-5");
  });

  it("otherwise the model with the most input tokens, cache tokens included", () => {
    expect(mainModelIdentifier(null, usageByModel)).toBe("claude-sonnet-5-5");
  });

  it("keeps the first model on a tie", () => {
    expect(
      mainModelIdentifier(null, {
        "model-a": modelUsage({ inputTokens: 5 }),
        "model-b": modelUsage({ cacheReadInputTokens: 5 }),
      }),
    ).toBe("model-a");
  });

  it("is null without a model option or usage", () => {
    expect(mainModelIdentifier(null, undefined)).toBeNull();
    expect(mainModelIdentifier(null, {})).toBeNull();
  });

  it("handles prototype-key model names", () => {
    // JSON.parse makes "__proto__" an own key, as it would be in a parsed SDK message.
    const usageByPrototypeKey: unknown = JSON.parse(
      `{"constructor":${JSON.stringify(modelUsage({ inputTokens: 1 }))},` +
        `"toString":${JSON.stringify(modelUsage({ inputTokens: 2 }))},` +
        `"__proto__":${JSON.stringify(modelUsage({ inputTokens: 3 }))}}`,
    );
    expect(Object.hasOwn(usageByPrototypeKey as object, "__proto__")).toBe(true);
    expect(mainModelIdentifier(null, usageByPrototypeKey)).toBe("__proto__");
  });
});
