import { DEFAULT_MODEL_PRICES } from "@krinolabs/krino";
import { describe, expect, it } from "vitest";
import {
  EMPTY_TRACE_AGGREGATES,
  type TraceAggregates,
} from "../trace-reader/read-trace-aggregates.js";
import {
  agreementMetricForHost,
  buildReport,
  cacheShares,
  hostAgreements,
} from "./build-report.js";
import { chooseNextStep } from "./next-step.js";
import { formatUsd } from "./render-report-text.js";
import type { DecisionReport, KrinoReport } from "./report-types.js";

const reportContext = {
  projectName: null,
  since: new Date("2026-09-25T12:00:00.000Z"),
  generatedAt: new Date("2026-10-02T12:00:00.000Z"),
  traceDirectory: "/traces",
  tokensPerToolDefinition: 100,
  modelPrices: DEFAULT_MODEL_PRICES,
};

function aggregates(overrides: Partial<TraceAggregates>): TraceAggregates {
  return {
    ...EMPTY_TRACE_AGGREGATES,
    traceFileCount: 1,
    lineCounts: { ...EMPTY_TRACE_AGGREGATES.lineCounts, readLineCount: 10, validLineCount: 10 },
    recordCounts: { agentStepCount: 10, runSummaryCount: 0, runCount: 1, projectNames: ["shop"] },
    ...overrides,
  };
}

describe("agreement per host", () => {
  it("uses the per-run metric for the Claude Agent SDK and per-step for every other host", () => {
    expect(agreementMetricForHost("claude-agent-sdk")).toBe("runToolsInSuggestedSet");
    expect(agreementMetricForHost("ai-sdk")).toBe("stepToolsInSuggestedSet");
    expect(agreementMetricForHost("some-future-host")).toBe("stepToolsInSuggestedSet");
  });

  it("keeps only each host's own metric and mode", () => {
    const perStep = [
      { hostName: "ai-sdk", decisionMode: "shadow", agreeingCount: 9, comparedCount: 10 },
      { hostName: "claude-agent-sdk", decisionMode: "shadow", agreeingCount: 1, comparedCount: 1 },
      { hostName: "ai-sdk", decisionMode: "enforce", agreeingCount: 1, comparedCount: 2 },
    ];
    const perRun = [
      { hostName: "claude-agent-sdk", decisionMode: "shadow", agreeingCount: 3, comparedCount: 4 },
      { hostName: "ai-sdk", decisionMode: "shadow", agreeingCount: 0, comparedCount: 4 },
    ];
    expect(hostAgreements("shadow", perStep, perRun)).toEqual([
      {
        hostName: "ai-sdk",
        metric: "stepToolsInSuggestedSet",
        metricLabel: "steps whose called tools were all in the suggested set",
        agreeingCount: 9,
        comparedCount: 10,
        agreementRate: 0.9,
      },
      {
        hostName: "claude-agent-sdk",
        metric: "runToolsInSuggestedSet",
        metricLabel: "runs whose used tools were all in the suggested set",
        agreeingCount: 3,
        comparedCount: 4,
        agreementRate: 0.75,
      },
    ]);
  });
});

describe("cost saved if enforced", () => {
  const toolSelectionCalls = [
    {
      decisionKind: "toolSelection",
      decisionMode: "shadow",
      decisionStatus: "answered",
      decisionCount: 2,
      decisionCostInUsd: 0.0002,
    },
  ];

  it("prices removed tokens with cache read and write multipliers", () => {
    const report = buildReport(
      aggregates({
        decisionStatusCounts: toolSelectionCalls,
        suggestionRunCounts: [{ decisionMode: "shadow", runCount: 2 }],
        removedToolTokens: [
          {
            decisionMode: "shadow",
            modelIdentifier: "claude-sonnet-5-5",
            runCount: 2,
            removedUncachedTokens: 1000,
            removedCacheReadTokens: 10_000,
            removedCacheWriteTokens: 2000,
          },
        ],
      }),
      reportContext,
    );
    // Sonnet: $2 input; cache read 0.1×, cache write 1.25×.
    // 1000 × 2 + 10,000 × 0.2 + 2000 × 2.5 = 9000 per million tokens = $0.009.
    expect(report.decisions[0]?.costSavedIfEnforced).toEqual({
      estimateKind: "estimated",
      tokensPerToolDefinition: 100,
      grossSavingInUsd: 0.009,
      decisionCostInUsd: 0.0002,
      netSavingInUsd: 0.0088,
      suggestionRunCount: 2,
      unpricedModelIdentifiers: [],
    });
    expect(report.assumptions.modelPrices).toEqual([
      { modelIdentifier: "claude-sonnet-5-5", verifiedOn: "2026-10-02" },
    ]);
  });

  it("is null when no model has a price, and names the unpriced models", () => {
    const report = buildReport(
      aggregates({
        decisionStatusCounts: toolSelectionCalls,
        suggestionRunCounts: [{ decisionMode: "shadow", runCount: 1 }],
        removedToolTokens: [
          {
            decisionMode: "shadow",
            modelIdentifier: "toString",
            runCount: 1,
            removedUncachedTokens: 100,
            removedCacheReadTokens: 0,
            removedCacheWriteTokens: 0,
          },
        ],
      }),
      reportContext,
    );
    expect(report.decisions[0]?.costSavedIfEnforced).toMatchObject({
      grossSavingInUsd: null,
      netSavingInUsd: null,
      unpricedModelIdentifiers: ["toString"],
    });
  });

  it("is not applicable to the risk gate", () => {
    const report = buildReport(
      aggregates({
        decisionStatusCounts: [
          {
            decisionKind: "riskGate",
            decisionMode: "shadow",
            decisionStatus: "answered",
            decisionCount: 1,
            decisionCostInUsd: 0.0001,
          },
        ],
      }),
      reportContext,
    );
    expect(report.decisions[0]?.costSavedIfEnforced.estimateKind).toBe("notApplicable");
    expect(report.decisions[0]?.agreementByHost).toEqual([]);
  });
});

describe("decision rows", () => {
  it("sorts kinds and modes and leaves skippedUnsupported out of calls", () => {
    const report = buildReport(
      aggregates({
        decisionStatusCounts: [
          {
            decisionKind: "riskGate",
            decisionMode: "shadow",
            decisionStatus: "answered",
            decisionCount: 1,
            decisionCostInUsd: 0,
          },
          {
            decisionKind: "toolSelection",
            decisionMode: "enforce",
            decisionStatus: "skippedUnsupported",
            decisionCount: 3,
            decisionCostInUsd: 0,
          },
          {
            decisionKind: "toolSelection",
            decisionMode: "enforce",
            decisionStatus: "answered",
            decisionCount: 2,
            decisionCostInUsd: 0,
          },
          {
            decisionKind: "toolSelection",
            decisionMode: "shadow",
            decisionStatus: "cutOff",
            decisionCount: 1,
            decisionCostInUsd: 0,
          },
          {
            decisionKind: "toolSelection",
            decisionMode: "shadow",
            decisionStatus: "newStatus",
            decisionCount: 1,
            decisionCostInUsd: 0,
          },
        ],
      }),
      reportContext,
    );
    expect(
      report.decisions.map((decisionReport) => [
        decisionReport.decisionKind,
        decisionReport.decisionMode,
        decisionReport.callCount,
      ]),
    ).toEqual([
      ["toolSelection", "shadow", 2],
      ["toolSelection", "enforce", 2],
      ["riskGate", "shadow", 1],
    ]);
    expect(report.cutOffs).toEqual({ cutOffCount: 1, callCount: 5, cutOffShare: 0.2 });
  });
});

describe("cacheShares", () => {
  it("has null shares without tokens", () => {
    expect(cacheShares([])).toMatchObject({
      totalInputTokens: 0,
      cacheReadShare: null,
      cacheWriteShare: null,
      uncachedShare: null,
    });
  });

  it("splits input tokens into read, written and uncached", () => {
    expect(
      cacheShares([{ uncachedTokens: 10, cacheReadTokens: 70, cacheWriteTokens: 20 }]),
    ).toMatchObject({
      totalInputTokens: 100,
      cacheReadShare: 0.7,
      cacheWriteShare: 0.2,
      uncachedShare: 0.1,
    });
  });
});

function toolSelectionShadow(overrides: Partial<DecisionReport>): DecisionReport {
  return {
    decisionKind: "toolSelection",
    decisionMode: "shadow",
    callCount: 40,
    statusCounts: {
      answered: 40,
      timedOut: 0,
      failed: 0,
      cutOff: 0,
      skippedUnsupported: 0,
      skippedExploration: 0,
    },
    agreementByHost: [],
    costSavedIfEnforced: {
      estimateKind: "estimated",
      tokensPerToolDefinition: 100,
      grossSavingInUsd: 0.05,
      decisionCostInUsd: 0.01,
      netSavingInUsd: 0.04,
      suggestionRunCount: 40,
      unpricedModelIdentifiers: [],
    },
    decisionCostInUsd: 0.01,
    addedLatencyInMilliseconds: { p50: 0, p95: 0 },
    decisionLatencyInMilliseconds: { p50: 200, p95: 400 },
    ...overrides,
  };
}

function hostAgreement(hostName: string, agreeingCount: number, comparedCount: number) {
  return {
    hostName,
    metric: agreementMetricForHost(hostName),
    metricLabel: "label",
    agreeingCount,
    comparedCount,
    agreementRate: agreeingCount / comparedCount,
  };
}

function baseReport(
  overrides: Partial<Omit<KrinoReport, "nextStep">>,
): Omit<KrinoReport, "nextStep"> {
  const { nextStep: _nextStep, ...emptyReport } = buildReport(aggregates({}), reportContext);
  return { ...emptyReport, ...overrides };
}

describe("chooseNextStep", () => {
  it("asks for traces when there are none", () => {
    const { nextStep } = buildReport(EMPTY_TRACE_AGGREGATES, reportContext);
    expect(nextStep).toMatch(/^No traces found in \/traces\./);
  });

  it("warns about cut-offs above 5% first", () => {
    const report = baseReport({
      cutOffs: { cutOffCount: 6, callCount: 100, cutOffShare: 0.06 },
      decisions: [toolSelectionShadow({ agreementByHost: [hostAgreement("ai-sdk", 99, 100)] })],
    });
    expect(chooseNextStep(report)).toBe(
      "6% of decisions were cut off: await finishRun (or flushAll) before the process exits.",
    );
  });

  it("suggests enforce on step 0 when every judged host agrees 90% or more", () => {
    const report = baseReport({
      decisions: [
        toolSelectionShadow({
          agreementByHost: [
            hostAgreement("ai-sdk", 46, 50),
            hostAgreement("claude-agent-sdk", 18, 20),
            hostAgreement("small-host", 0, 3),
          ],
        }),
      ],
    });
    expect(chooseNextStep(report)).toBe(
      'Tool selection agrees 90%+ on ai-sdk and claude-agent-sdk: try enforce on step 0 (decisionModes.toolSelection: "enforce").',
    );
  });

  it("keeps shadow mode when a host agrees less than 90%", () => {
    const report = baseReport({
      decisions: [
        toolSelectionShadow({
          agreementByHost: [
            hostAgreement("ai-sdk", 46, 50),
            hostAgreement("claude-agent-sdk", 15, 20),
          ],
        }),
      ],
    });
    expect(chooseNextStep(report)).toBe(
      "Keep tool selection in shadow mode: agreement on claude-agent-sdk is 75%, below 90%.",
    );
  });

  it("keeps shadow mode when high agreement would not pay off", () => {
    const report = baseReport({
      decisions: [
        toolSelectionShadow({
          agreementByHost: [hostAgreement("ai-sdk", 50, 50)],
          costSavedIfEnforced: {
            estimateKind: "estimated",
            tokensPerToolDefinition: 100,
            grossSavingInUsd: 0.001,
            decisionCostInUsd: 0.01,
            netSavingInUsd: -0.009,
            suggestionRunCount: 50,
            unpricedModelIdentifiers: [],
          },
        }),
      ],
    });
    expect(chooseNextStep(report)).toContain("net saving is not positive");
  });

  it("asks for more samples below 20 per host", () => {
    const report = baseReport({
      decisions: [toolSelectionShadow({ agreementByHost: [hostAgreement("ai-sdk", 5, 5)] })],
    });
    expect(chooseNextStep(report)).toBe(
      "Keep tool selection in shadow mode: agreement needs at least 20 compared samples per host (most so far: 5).",
    );
  });

  it("reminds enforce users to keep exploring", () => {
    const report = baseReport({
      decisions: [toolSelectionShadow({ decisionMode: "enforce" })],
    });
    expect(chooseNextStep(report)).toContain("keep explorationRate above 0");
  });

  it("flags a low cache read share when tool selection has nothing to say", () => {
    const report = baseReport({
      cacheHealth: {
        overall: cacheShares([{ uncachedTokens: 80, cacheReadTokens: 10, cacheWriteTokens: 10 }]),
        byHost: [],
      },
    });
    expect(chooseNextStep(report)).toBe(
      "Only 10% of input tokens were read from cache: check that prompt caching is on.",
    );
    expect(chooseNextStep(baseReport({}))).toBe("Nothing to change: keep collecting traces.");
  });
});

describe("formatUsd", () => {
  it("shows four decimals below a dollar and keeps the sign", () => {
    expect(formatUsd(0.00366)).toBe("$0.0037");
    expect(formatUsd(-0.0012)).toBe("-$0.0012");
    expect(formatUsd(12.345)).toBe("$12.35");
  });
});
