import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import nodePath from "node:path";
import { FAKE_DECISION_MODEL_VERSION } from "@krinolabs/krino";
import { describe, expect, it } from "vitest";
import { cacheShares } from "../report/build-report.js";
import { listTraceFiles } from "../trace-reader/list-trace-files.js";
import { nonBlankLines, readTraceAggregates } from "../trace-reader/read-trace-aggregates.js";
import type { TraceLocation } from "../trace-reader/trace-directory.js";
import {
  classifyTraceLine,
  summarizeTraceLines,
  type TraceScanFilters,
} from "./doctor-trace-scan.js";

const tokenUsage = {
  inputTokens: 100,
  outputTokens: 20,
  cacheReadTokens: 300,
  cacheWriteTokens: 50,
};

function agentStep(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    traceSchemaVersion: 1,
    recordType: "agentStep",
    projectName: "shop",
    runIdentifier: "run-1",
    stepNumber: 0,
    hostName: "ai-sdk",
    hostSdkVersion: "7.0.126",
    modelIdentifier: "anthropic/claude-sonnet-5-5",
    availableToolNames: ["search"],
    chosenToolNames: ["search"],
    tokenUsage,
    costInUsd: 0.01,
    latencyInMilliseconds: 900,
    recordedAt: "2026-10-01T10:00:00.000Z",
    decisions: [
      {
        decisionKind: "toolSelection",
        decisionMode: "shadow",
        decisionStatus: "answered",
        suggestedChoice: "search",
        appliedChoice: "search",
        probability: 0.9,
        decisionModelVersion: "jev-1",
        latencyInMilliseconds: 300,
        decisionCostInUsd: 0.001,
      },
    ],
    contentHash: null,
    ...overrides,
  };
}

function runSummary(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    traceSchemaVersion: 1,
    recordType: "runSummary",
    projectName: "shop",
    runIdentifier: "run-1",
    hostName: "ai-sdk",
    hostSdkVersion: "7.0.126",
    modelIdentifier: "anthropic/claude-sonnet-5-5",
    totalTokenUsage: tokenUsage,
    totalCostInUsd: 0.02,
    stepCount: 2,
    usedToolNames: ["search"],
    toolSelectionAgreement: true,
    recordedAt: "2026-10-01T10:00:05.000Z",
    ...overrides,
  };
}

function decision(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    decisionKind: "riskGate",
    decisionMode: "shadow",
    decisionStatus: "answered",
    suggestedChoice: "allow",
    appliedChoice: null,
    probability: 0.9,
    decisionModelVersion: "jev-1",
    latencyInMilliseconds: 10,
    decisionCostInUsd: 0,
    ...overrides,
  };
}

const everything: TraceScanFilters = { projectName: null, sinceEpochMilliseconds: 0 };

/** Lines a hand-edited or foreign file may hold, each with the class WP-09's reader gives it. */
const EDGE_CASE_LINES: Array<[string, string]> = [
  [JSON.stringify(agentStep()), "valid"],
  [JSON.stringify(runSummary()), "valid"],
  [JSON.stringify(agentStep({ tokenUsage: null, decisions: [] })), "valid"],
  [JSON.stringify(runSummary({ toolSelectionAgreement: null })), "valid"],
  ["{not json", "invalidJson"],
  ['{"traceSchemaVersion":1,', "invalidJson"],
  ["[1,2,3]", "invalidShape"],
  ['"text"', "invalidShape"],
  ["42", "invalidShape"],
  ["null", "invalidShape"],
  [JSON.stringify(agentStep({ traceSchemaVersion: 2 })), "unsupportedSchemaVersion"],
  [JSON.stringify(agentStep({ traceSchemaVersion: "1" })), "unsupportedSchemaVersion"],
  [JSON.stringify(agentStep({ traceSchemaVersion: undefined })), "unsupportedSchemaVersion"],
  [JSON.stringify(agentStep({ recordType: "somethingElse" })), "invalidShape"],
  [JSON.stringify(agentStep({ recordType: undefined })), "invalidShape"],
  [JSON.stringify(agentStep({ projectName: 7 })), "invalidShape"],
  [JSON.stringify(agentStep({ runIdentifier: undefined })), "invalidShape"],
  [JSON.stringify(agentStep({ hostName: null })), "invalidShape"],
  [JSON.stringify(agentStep({ modelIdentifier: ["x"] })), "invalidShape"],
  [JSON.stringify(agentStep({ stepNumber: "0" })), "invalidShape"],
  [JSON.stringify(agentStep({ availableToolNames: "search" })), "invalidShape"],
  [JSON.stringify(agentStep({ chosenToolNames: undefined })), "invalidShape"],
  [JSON.stringify(agentStep({ tokenUsage: undefined })), "invalidShape"],
  [
    JSON.stringify(
      agentStep({ tokenUsage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 1 } }),
    ),
    "invalidShape",
  ],
  [JSON.stringify(agentStep({ decisions: undefined })), "invalidShape"],
  [JSON.stringify(agentStep({ decisions: [null] })), "invalidShape"],
  [JSON.stringify(agentStep({ decisions: [decision({ decisionStatus: null })] })), "invalidShape"],
  [JSON.stringify(agentStep({ recordedAt: "yesterday" })), "invalidShape"],
  [JSON.stringify(runSummary({ totalTokenUsage: null })), "invalidShape"],
  [JSON.stringify(runSummary({ stepCount: undefined })), "invalidShape"],
  [JSON.stringify(runSummary({ usedToolNames: {} })), "invalidShape"],
  [JSON.stringify(runSummary({ toolSelectionAgreement: undefined })), "invalidShape"],
  [JSON.stringify(runSummary({ toolSelectionAgreement: "yes" })), "invalidShape"],
  [JSON.stringify(runSummary({ recordedAt: 5 })), "invalidShape"],
];

describe("classifyTraceLine", () => {
  it.each(EDGE_CASE_LINES)("classifies %s as %s", (lineText, expectedClass) => {
    expect(classifyTraceLine(lineText).lineClass).toBe(expectedClass);
  });

  it("reads prototype-named keys as plain data", () => {
    const lineText = JSON.stringify(agentStep()).replace(
      '"traceSchemaVersion":1,',
      '"traceSchemaVersion":1,"__proto__":{"recordType":"runSummary"},"constructor":1,',
    );
    const lineResult = classifyTraceLine(lineText);
    expect(lineResult.lineClass).toBe("valid");
    expect(lineResult.lineClass === "valid" ? lineResult.traceRecord.recordType : null).toBe(
      "agentStep",
    );
  });
});

describe("summarizeTraceLines", () => {
  it("counts lines, runs, steps and summaries", () => {
    const traceSummary = summarizeTraceLines(
      [
        JSON.stringify(agentStep()),
        JSON.stringify(agentStep({ stepNumber: 1 })),
        JSON.stringify(runSummary()),
        JSON.stringify(agentStep({ runIdentifier: "run-2" })),
        JSON.stringify(agentStep({ projectName: "other", runIdentifier: "run-2" })),
        "{bad",
        "[]",
        JSON.stringify(agentStep({ traceSchemaVersion: 9 })),
      ],
      everything,
    );
    expect(traceSummary.lineCounts).toEqual({
      readLineCount: 8,
      validLineCount: 5,
      invalidJsonLineCount: 1,
      unsupportedSchemaVersionLineCount: 1,
      invalidShapeLineCount: 1,
    });
    expect(traceSummary.agentStepCount).toBe(4);
    expect(traceSummary.runSummaryCount).toBe(1);
    expect(traceSummary.runCount).toBe(3);
  });

  it("filters valid records by project and time, but counts every line", () => {
    const traceSummary = summarizeTraceLines(
      [
        JSON.stringify(agentStep()),
        JSON.stringify(agentStep({ projectName: "other" })),
        JSON.stringify(agentStep({ recordedAt: "2026-01-01T00:00:00.000Z" })),
      ],
      { projectName: "shop", sinceEpochMilliseconds: Date.parse("2026-09-01T00:00:00.000Z") },
    );
    expect(traceSummary.lineCounts.readLineCount).toBe(3);
    expect(traceSummary.agentStepCount).toBe(1);
  });

  it("counts decisions, cut-offs and fake-provider decisions", () => {
    const traceSummary = summarizeTraceLines(
      [
        JSON.stringify(
          agentStep({
            decisions: [
              decision({ decisionStatus: "cutOff", decisionModelVersion: null }),
              decision({ decisionModelVersion: FAKE_DECISION_MODEL_VERSION }),
              decision({}),
            ],
          }),
        ),
      ],
      everything,
    );
    expect(traceSummary.decisionCount).toBe(3);
    expect(traceSummary.cutOffDecisionCount).toBe(1);
    expect(traceSummary.fakeProviderDecisionCount).toBe(1);
  });

  it("takes a run's usage from its summary, and ignores that run's steps (as krino report does)", () => {
    const traceSummary = summarizeTraceLines(
      [
        JSON.stringify(agentStep({ stepNumber: 0 })),
        JSON.stringify(agentStep({ stepNumber: 1 })),
        JSON.stringify(runSummary({ stepCount: 2 })),
      ],
      everything,
    );
    expect(traceSummary.cacheUsageByHost).toEqual([
      { hostName: "ai-sdk", uncachedTokens: 100, cacheReadTokens: 300, cacheWriteTokens: 50 },
    ]);
  });

  it("takes usage from the steps of a run without a summary, skipping steps with no usage", () => {
    const traceSummary = summarizeTraceLines(
      [
        JSON.stringify(agentStep({ runIdentifier: "cut", stepNumber: 0 })),
        JSON.stringify(agentStep({ runIdentifier: "cut", stepNumber: 1 })),
        JSON.stringify(agentStep({ runIdentifier: "cut", stepNumber: 2, tokenUsage: null })),
      ],
      everything,
    );
    expect(traceSummary.cacheUsageByHost).toEqual([
      { hostName: "ai-sdk", uncachedTokens: 200, cacheReadTokens: 600, cacheWriteTokens: 100 },
    ]);
    expect(traceSummary.multiStepRunUsage.runCount).toBe(1);
  });

  it("groups usage per host, sorted by host name", () => {
    const traceSummary = summarizeTraceLines(
      [
        JSON.stringify(runSummary({ hostName: "claude-agent-sdk", runIdentifier: "c-1" })),
        JSON.stringify(runSummary({ runIdentifier: "a-1" })),
      ],
      everything,
    );
    expect(traceSummary.cacheUsageByHost.map((usageRow) => usageRow.hostName)).toEqual([
      "ai-sdk",
      "claude-agent-sdk",
    ]);
  });

  it("sums multi-step usage over runs with more than one step only", () => {
    const traceSummary = summarizeTraceLines(
      [
        JSON.stringify(runSummary({ stepCount: 3 })),
        JSON.stringify(
          runSummary({
            runIdentifier: "run-2",
            stepCount: 1,
            totalTokenUsage: { ...tokenUsage, cacheReadTokens: 999 },
          }),
        ),
        // No summary and one step: single-step.
        JSON.stringify(agentStep({ runIdentifier: "run-3" })),
      ],
      everything,
    );
    expect(traceSummary.multiStepRunUsage).toEqual({
      runCount: 1,
      uncachedTokens: 100,
      cacheReadTokens: 300,
      cacheWriteTokens: 50,
    });
    expect(traceSummary.cacheUsageByHost).toEqual([
      { hostName: "ai-sdk", uncachedTokens: 300, cacheReadTokens: 1599, cacheWriteTokens: 150 },
    ]);
  });
});

/** WP-09's reader and this scanner over the same files, with the same filters. */
async function compareReaders(traceLocation: TraceLocation): Promise<void> {
  const traceFilePaths = await listTraceFiles(traceLocation, "1970-01-01");
  expect(traceFilePaths.length).toBeGreaterThan(0);
  const traceAggregates = await readTraceAggregates(traceFilePaths, {
    projectName: null,
    sinceEpochMilliseconds: 0,
    tokensPerToolDefinition: 175,
  });
  const fileTexts = await Promise.all(traceFilePaths.map((filePath) => readFile(filePath, "utf8")));
  const traceSummary = summarizeTraceLines(fileTexts.flatMap(nonBlankLines), everything);

  expect(traceSummary.lineCounts).toEqual(traceAggregates.lineCounts);
  expect(traceSummary.runCount).toBe(traceAggregates.recordCounts.runCount);
  expect(traceSummary.agentStepCount).toBe(traceAggregates.recordCounts.agentStepCount);
  expect(traceSummary.runSummaryCount).toBe(traceAggregates.recordCounts.runSummaryCount);

  // Cache read share: the same token sources as `krino report`, overall and per host.
  expect(traceSummary.cacheUsageByHost.length).toBeGreaterThan(0);
  expect(cacheShares(traceSummary.cacheUsageByHost)).toEqual(
    cacheShares(traceAggregates.cacheUsage),
  );
  expect(traceSummary.cacheUsageByHost).toEqual(traceAggregates.cacheUsage);
  for (const reportRow of traceAggregates.cacheUsage) {
    const doctorRow = traceSummary.cacheUsageByHost.find(
      (usageRow) => usageRow.hostName === reportRow.hostName,
    );
    expect(cacheShares(doctorRow === undefined ? [] : [doctorRow]).cacheReadShare).toBe(
      cacheShares([reportRow]).cacheReadShare,
    );
  }
}

describe("parity with WP-09's trace reader", () => {
  const fixtureTracesRoot = nodePath.join(
    import.meta.dirname,
    "..",
    "report",
    "fixtures",
    "home",
    ".krino",
    "traces",
  );

  it("counts the same runs, steps and bad lines on the WP-09 fixture folders", async () => {
    await compareReaders({ locationKind: "tracesRoot", directoryPath: fixtureTracesRoot });
    await compareReaders({
      locationKind: "projectFolder",
      directoryPath: nodePath.join(fixtureTracesRoot, "fixture-project"),
    });
  });

  it("counts the same on edge-case lines", async () => {
    const edgeCaseFolder = await mkdtemp(nodePath.join(tmpdir(), "krino-doctor-parity-"));
    try {
      await writeFile(
        nodePath.join(edgeCaseFolder, "traces-2026-10-01.jsonl"),
        // CRLF line ends, as an editor on Windows may save them.
        `${EDGE_CASE_LINES.map(([lineText]) => lineText).join("\r\n")}\r\n`,
      );
      await compareReaders({ locationKind: "projectFolder", directoryPath: edgeCaseFolder });
    } finally {
      await rm(edgeCaseFolder, { recursive: true, force: true });
    }
  });
});
