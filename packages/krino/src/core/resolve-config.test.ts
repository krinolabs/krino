import { describe, expect, it, vi } from "vitest";
import type { KrinoConfig } from "../contracts/index.js";
import { KRINO_CONFIG_DEFAULTS, KrinoConfigurationError } from "../contracts/index.js";
import { createKrino } from "./create-krino.js";
import { createRecordingTraceSink } from "./local-test-doubles.js";
import { resolveKrinoConfig } from "./resolve-config.js";

const minimalConfig: KrinoConfig = { projectName: "demo", decisionModes: {} };

function expectConfigError(krinoConfig: unknown, configFieldName: string): void {
  let caughtError: unknown;
  try {
    resolveKrinoConfig(krinoConfig as KrinoConfig);
  } catch (configError) {
    caughtError = configError;
  }
  expect(caughtError).toBeInstanceOf(KrinoConfigurationError);
  expect((caughtError as KrinoConfigurationError).configFieldName).toBe(configFieldName);
}

describe("resolveKrinoConfig", () => {
  it("applies every default", () => {
    const resolvedConfig = resolveKrinoConfig(minimalConfig);
    expect(resolvedConfig).toMatchObject({
      projectName: "demo",
      decisionModes: { toolSelection: "shadow", riskGate: "shadow" },
      minimumConfidence: KRINO_CONFIG_DEFAULTS.minimumConfidence,
      decisionTimeoutInMilliseconds: KRINO_CONFIG_DEFAULTS.decisionTimeoutInMilliseconds,
      explorationRate: KRINO_CONFIG_DEFAULTS.explorationRate,
      riskGatePolicy: null,
      decisionProvider: null,
      traceSink: null,
      redactContent: true,
      priceOverrides: [],
    });
    expect(resolvedConfig.randomSource).toBe(Math.random);
  });

  it("keeps given values", () => {
    const traceSink = createRecordingTraceSink();
    const randomSource = (): number => 0.5;
    const resolvedConfig = resolveKrinoConfig({
      projectName: "demo",
      decisionModes: { toolSelection: "enforce", riskGate: "off" },
      minimumConfidence: 0.6,
      decisionTimeoutInMilliseconds: 1500,
      explorationRate: 0,
      riskGatePolicy: {
        blockedToolNames: ["rm"],
        alwaysAllowedToolNames: ["ls"],
        allowThresholdByToolName: { curl: 0.7 },
      },
      traceSink,
      redactContent: false,
      priceOverrides: [
        {
          modelIdentifier: "custom",
          inputPricePerMillionTokens: 1,
          outputPricePerMillionTokens: 2,
          cacheWriteMultiplier: 1.25,
          cacheReadMultiplier: 0.1,
          verifiedOn: "2026-10-01",
        },
      ],
      randomSource,
    });
    expect(resolvedConfig).toMatchObject({
      decisionModes: { toolSelection: "enforce", riskGate: "off" },
      minimumConfidence: 0.6,
      decisionTimeoutInMilliseconds: 1500,
      explorationRate: 0,
      riskGatePolicy: { blockedToolNames: ["rm"], allowThresholdByToolName: { curl: 0.7 } },
      redactContent: false,
    });
    expect(resolvedConfig.traceSink).toBe(traceSink);
    expect(resolvedConfig.randomSource).toBe(randomSource);
    expect(resolvedConfig.priceOverrides).toHaveLength(1);
  });

  it.each(["constructor", "toString", "__proto__"])(
    "keeps a threshold for a tool named %s as its own value",
    (toolName) => {
      // JSON config is how a key like `__proto__` arrives as an own property.
      const allowThresholdByToolName = JSON.parse(`{${JSON.stringify(toolName)}: 0.7}`);
      const resolvedPolicy = resolveKrinoConfig({
        ...minimalConfig,
        riskGatePolicy: {
          blockedToolNames: [],
          alwaysAllowedToolNames: [],
          allowThresholdByToolName,
        },
      }).riskGatePolicy;
      const resolvedThresholds = resolvedPolicy?.allowThresholdByToolName ?? {};
      expect(Object.hasOwn(resolvedThresholds, toolName)).toBe(true);
      expect(Object.getOwnPropertyDescriptor(resolvedThresholds, toolName)?.value).toBe(0.7);
      expect(Object.getPrototypeOf(resolvedThresholds)).toBe(Object.prototype);

      expectConfigError(
        {
          ...minimalConfig,
          riskGatePolicy: {
            blockedToolNames: [],
            alwaysAllowedToolNames: [],
            allowThresholdByToolName: JSON.parse(`{${JSON.stringify(toolName)}: 2}`),
          },
        },
        `riskGatePolicy.allowThresholdByToolName.${toolName}`,
      );
    },
  );

  it("treats an undefined mode as the default", () => {
    expect(
      resolveKrinoConfig({
        projectName: "demo",
        decisionModes: { toolSelection: undefined } as unknown as KrinoConfig["decisionModes"],
      }).decisionModes.toolSelection,
    ).toBe("shadow");
  });

  it("accepts the default mode of every decision kind, modelRouting included", () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(() =>
        createKrino({
          projectName: "demo",
          decisionModes: { ...KRINO_CONFIG_DEFAULTS.decisionModes },
        }),
      ).not.toThrow();
    } finally {
      consoleWarn.mockRestore();
    }
  });

  it("refuses to run the risk gate in enforce mode (it cannot fail open)", () => {
    expectConfigError(
      { projectName: "demo", decisionModes: { riskGate: "enforce" } },
      "decisionModes.riskGate",
    );
  });

  it.each([
    [null, null],
    [{ decisionModes: {} }, "projectName"],
    [{ projectName: "  ", decisionModes: {} }, "projectName"],
    [{ projectName: "demo" }, "decisionModes"],
    [{ projectName: "demo", decisionModes: { routing: "shadow" } }, "decisionModes.routing"],
    [
      { projectName: "demo", decisionModes: { toolSelection: "always" } },
      "decisionModes.toolSelection",
    ],
    [{ ...minimalConfig, minimumConfidence: 1.5 }, "minimumConfidence"],
    [{ ...minimalConfig, decisionTimeoutInMilliseconds: 0 }, "decisionTimeoutInMilliseconds"],
    [
      { ...minimalConfig, decisionTimeoutInMilliseconds: Number.NaN },
      "decisionTimeoutInMilliseconds",
    ],
    [{ ...minimalConfig, explorationRate: -0.1 }, "explorationRate"],
    [{ ...minimalConfig, redactContent: "yes" }, "redactContent"],
    [{ ...minimalConfig, randomSource: 0.5 }, "randomSource"],
    [{ ...minimalConfig, riskGatePolicy: [] }, "riskGatePolicy"],
    [
      {
        ...minimalConfig,
        riskGatePolicy: {
          blockedToolNames: "rm",
          alwaysAllowedToolNames: [],
          allowThresholdByToolName: {},
        },
      },
      "riskGatePolicy.blockedToolNames",
    ],
    [
      {
        ...minimalConfig,
        riskGatePolicy: {
          blockedToolNames: [],
          alwaysAllowedToolNames: [1],
          allowThresholdByToolName: {},
        },
      },
      "riskGatePolicy.alwaysAllowedToolNames",
    ],
    [
      {
        ...minimalConfig,
        riskGatePolicy: {
          blockedToolNames: [],
          alwaysAllowedToolNames: [],
          allowThresholdByToolName: null,
        },
      },
      "riskGatePolicy.allowThresholdByToolName",
    ],
    [
      {
        ...minimalConfig,
        riskGatePolicy: {
          blockedToolNames: [],
          alwaysAllowedToolNames: [],
          allowThresholdByToolName: { curl: 2 },
        },
      },
      "riskGatePolicy.allowThresholdByToolName.curl",
    ],
    [{ ...minimalConfig, decisionProvider: { providerName: "x" } }, "decisionProvider"],
    [{ ...minimalConfig, traceSink: { writeRecord: () => {} } }, "traceSink"],
    [{ ...minimalConfig, priceOverrides: {} }, "priceOverrides"],
    [{ ...minimalConfig, priceOverrides: [{}] }, "priceOverrides.0"],
    [
      {
        ...minimalConfig,
        priceOverrides: [
          {
            modelIdentifier: "m",
            inputPricePerMillionTokens: -1,
            outputPricePerMillionTokens: 1,
            cacheWriteMultiplier: 1,
            cacheReadMultiplier: 1,
            verifiedOn: "2026-10-01",
          },
        ],
      },
      "priceOverrides.0.inputPricePerMillionTokens",
    ],
    [
      {
        ...minimalConfig,
        priceOverrides: [
          {
            modelIdentifier: "m",
            inputPricePerMillionTokens: 1,
            outputPricePerMillionTokens: 1,
            cacheWriteMultiplier: 1,
            cacheReadMultiplier: 1,
          },
        ],
      },
      "priceOverrides.0.verifiedOn",
    ],
  ])("rejects %j at %s", (krinoConfig, configFieldName) => {
    expectConfigError(krinoConfig, configFieldName as string);
  });
});
