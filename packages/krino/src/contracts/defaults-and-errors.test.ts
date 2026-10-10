import { describe, expect, it } from "vitest";
import {
  DEFAULT_CACHE_READ_MULTIPLIER,
  DEFAULT_CACHE_WRITE_MULTIPLIER,
  DEFAULT_CONTEXT_SAFETY_MARGIN_RATIO,
  DEFAULT_DECISION_CONTEXT_BUDGET_IN_TOKENS,
  DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS,
  DecisionProviderError,
  DecisionTimeoutError,
  KRINO_CONFIG_DEFAULTS,
  KrinoConfigurationError,
  SUPPORTED_TRACE_SCHEMA_VERSIONS,
  TRACE_SCHEMA_VERSION,
} from "./index.js";

describe("KRINO_CONFIG_DEFAULTS", () => {
  it("matches the defaults written in 03-contracts.md", () => {
    expect(KRINO_CONFIG_DEFAULTS).toEqual({
      decisionModes: { toolSelection: "shadow", riskGate: "shadow", modelRouting: "shadow" },
      minimumConfidence: 0.8,
      decisionTimeoutInMilliseconds: 800,
      explorationRate: 0.05,
      redactContent: true,
    });
  });

  it("is frozen, including decisionModes", () => {
    expect(Object.isFrozen(KRINO_CONFIG_DEFAULTS)).toBe(true);
    expect(Object.isFrozen(KRINO_CONFIG_DEFAULTS.decisionModes)).toBe(true);
  });
});

describe("cache multiplier defaults", () => {
  it("match the ModelPrice comments", () => {
    expect(DEFAULT_CACHE_WRITE_MULTIPLIER).toBe(1.25);
    expect(DEFAULT_CACHE_READ_MULTIPLIER).toBe(0.1);
  });
});

describe("runtime limit defaults", () => {
  it("flush waits 2 s for pending decisions", () => {
    expect(DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS).toBe(2000);
  });

  it("decision context budget is 32,000 tokens with a 10% safety margin", () => {
    expect(DEFAULT_DECISION_CONTEXT_BUDGET_IN_TOKENS).toBe(32000);
    expect(DEFAULT_CONTEXT_SAFETY_MARGIN_RATIO).toBe(0.1);
  });

  it("margin ratio leaves a usable budget", () => {
    expect(DEFAULT_CONTEXT_SAFETY_MARGIN_RATIO).toBeGreaterThan(0);
    expect(DEFAULT_CONTEXT_SAFETY_MARGIN_RATIO).toBeLessThan(1);
    expect(
      DEFAULT_DECISION_CONTEXT_BUDGET_IN_TOKENS * (1 - DEFAULT_CONTEXT_SAFETY_MARGIN_RATIO),
    ).toBe(28800);
  });
});

describe("TRACE_SCHEMA_VERSION", () => {
  it("is 2", () => {
    expect(TRACE_SCHEMA_VERSION).toBe(2);
  });
});

describe("SUPPORTED_TRACE_SCHEMA_VERSIONS", () => {
  it("accepts version 1 traces and the version krino writes", () => {
    expect(SUPPORTED_TRACE_SCHEMA_VERSIONS).toEqual([1, 2]);
    expect(SUPPORTED_TRACE_SCHEMA_VERSIONS).toContain(TRACE_SCHEMA_VERSION);
  });

  it("is frozen", () => {
    expect(Object.isFrozen(SUPPORTED_TRACE_SCHEMA_VERSIONS)).toBe(true);
  });
});

describe("KrinoConfigurationError", () => {
  it("carries a name, message, field and cause", () => {
    const cause = new Error("not a number");
    const configurationError = new KrinoConfigurationError("minimumConfidence must be 0..1", {
      configFieldName: "minimumConfidence",
      cause,
    });

    expect(configurationError).toBeInstanceOf(Error);
    expect(configurationError).toBeInstanceOf(KrinoConfigurationError);
    expect(configurationError.name).toBe("KrinoConfigurationError");
    expect(configurationError.message).toBe("minimumConfidence must be 0..1");
    expect(configurationError.configFieldName).toBe("minimumConfidence");
    expect(configurationError.cause).toBe(cause);
  });

  it("defaults the field to null", () => {
    expect(new KrinoConfigurationError("bad config").configFieldName).toBeNull();
  });
});

describe("DecisionProviderError", () => {
  it("carries the provider name and cause", () => {
    const cause = new Error("HTTP 500");
    const providerError = new DecisionProviderError("provider failed", {
      providerName: "fake",
      cause,
    });

    expect(providerError).toBeInstanceOf(Error);
    expect(providerError.name).toBe("DecisionProviderError");
    expect(providerError.providerName).toBe("fake");
    expect(providerError.cause).toBe(cause);
  });
});

describe("DecisionTimeoutError", () => {
  it("carries the provider name and timeout, and says both in its message", () => {
    const timeoutError = new DecisionTimeoutError({
      providerName: "jev",
      timeoutInMilliseconds: 800,
    });

    expect(timeoutError).toBeInstanceOf(Error);
    expect(timeoutError).not.toBeInstanceOf(DecisionProviderError);
    expect(timeoutError.name).toBe("DecisionTimeoutError");
    expect(timeoutError.providerName).toBe("jev");
    expect(timeoutError.timeoutInMilliseconds).toBe(800);
    expect(timeoutError.message).toBe('Decision provider "jev" did not answer within 800 ms');
  });
});
