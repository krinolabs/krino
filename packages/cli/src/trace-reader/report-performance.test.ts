import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import nodePath from "node:path";
import { DEFAULT_MODEL_PRICES } from "@krinolabs/krino";
import { afterAll, describe, expect, it } from "vitest";
import { createReport, DEFAULT_TOKENS_PER_TOOL_DEFINITION } from "../commands/report.js";

// Acceptance: `krino report` on a 100 MB trace folder in under 5 seconds.
// Opt-in, because writing 100 MB is slow on CI disks: KRINO_PERF=1 pnpm vitest run report-performance
const runPerformanceTest = process.env.KRINO_PERF === "1";

const TARGET_FOLDER_SIZE_IN_BYTES = 100 * 1024 * 1024;
/** Same as the file sink's rotation size. */
const FILE_SIZE_IN_BYTES = 50 * 1024 * 1024;
const TIME_LIMIT_IN_MILLISECONDS = 5000;
const STEPS_PER_RUN = 5;
const TOOL_NAMES = Array.from({ length: 100 }, (_unused, toolIndex) => `tool${toolIndex}`);

function runLines(runIndex: number): Array<string> {
  const isClaudeAgentSdk = runIndex % 3 === 0;
  const hostName = isClaudeAgentSdk ? "claude-agent-sdk" : "ai-sdk";
  const runIdentifier = `run-${runIndex}`;
  const recordedAt = new Date(Date.UTC(2026, 9, 1, 0, 0, runIndex % 86_400)).toISOString();
  const suggestedTools = [TOOL_NAMES[runIndex % 100], TOOL_NAMES[(runIndex + 7) % 100]];
  const stepLines = Array.from({ length: STEPS_PER_RUN }, (_unused, stepNumber) =>
    JSON.stringify({
      traceSchemaVersion: 1,
      recordType: "agentStep",
      projectName: "perf-project",
      runIdentifier,
      stepNumber,
      hostName,
      hostSdkVersion: "1.0.0",
      modelIdentifier: "claude-haiku-4-5",
      availableToolNames: TOOL_NAMES,
      chosenToolNames: stepNumber % 2 === 0 ? [TOOL_NAMES[runIndex % 100]] : [],
      tokenUsage: isClaudeAgentSdk
        ? null
        : { inputTokens: 300, outputTokens: 120, cacheReadTokens: 9000, cacheWriteTokens: 400 },
      costInUsd: 0.001,
      latencyInMilliseconds: 800,
      recordedAt,
      decisions:
        stepNumber === 0
          ? [
              {
                decisionKind: "toolSelection",
                decisionMode: "shadow",
                decisionStatus: runIndex % 50 === 0 ? "cutOff" : "answered",
                suggestedChoice: runIndex % 50 === 0 ? null : [...suggestedTools].sort().join(","),
                appliedChoice: TOOL_NAMES.join(","),
                probability: 0.92,
                decisionModelVersion: "typesafe-ai/jev",
                latencyInMilliseconds: 200 + (runIndex % 300),
                decisionCostInUsd: 0.0003,
              },
            ]
          : [
              {
                decisionKind: "riskGate",
                decisionMode: "shadow",
                decisionStatus: "answered",
                suggestedChoice: "allow",
                appliedChoice: null,
                probability: 0.97,
                decisionModelVersion: "typesafe-ai/jev",
                latencyInMilliseconds: 150,
                decisionCostInUsd: 0.0001,
              },
            ],
      contentHash: null,
    }),
  );
  const summaryLine = JSON.stringify({
    traceSchemaVersion: 1,
    recordType: "runSummary",
    projectName: "perf-project",
    runIdentifier,
    hostName,
    hostSdkVersion: "1.0.0",
    modelIdentifier: "claude-haiku-4-5",
    totalTokenUsage: {
      inputTokens: 1500,
      outputTokens: 600,
      cacheReadTokens: 45000,
      cacheWriteTokens: 2000,
    },
    totalCostInUsd: 0.005,
    stepCount: STEPS_PER_RUN,
    usedToolNames: [TOOL_NAMES[runIndex % 100]],
    toolSelectionAgreement: isClaudeAgentSdk ? runIndex % 4 !== 0 : null,
    recordedAt,
  });
  return [...stepLines, summaryLine];
}

/** Writes 50 MB files, named like the sink's rotated files, until the folder holds 100 MB. */
function writeTraceFolder(folderPath: string): number {
  let folderSize = 0;
  let runIndex = 0;
  for (let fileIndex = 0; folderSize < TARGET_FOLDER_SIZE_IN_BYTES; fileIndex += 1) {
    const fileName =
      fileIndex === 0 ? "traces-2026-10-01.jsonl" : `traces-2026-10-01.${fileIndex}.jsonl`;
    const fileLines: Array<string> = [];
    let fileSize = 0;
    while (fileSize < FILE_SIZE_IN_BYTES && folderSize + fileSize < TARGET_FOLDER_SIZE_IN_BYTES) {
      for (const line of runLines(runIndex)) {
        fileLines.push(line);
        fileSize += Buffer.byteLength(line) + 1;
      }
      runIndex += 1;
    }
    const filePath = nodePath.join(folderPath, fileName);
    writeFileSync(filePath, `${fileLines.join("\n")}\n`);
    folderSize += statSync(filePath).size;
  }
  return folderSize;
}

describe.runIf(runPerformanceTest)("report performance", () => {
  const createdFolders: Array<string> = [];

  afterAll(() => {
    for (const folderPath of createdFolders) {
      rmSync(folderPath, { recursive: true, force: true, maxRetries: 5 });
    }
  });

  it("reports on a 100 MB trace folder in under 5 seconds", { timeout: 120_000 }, async () => {
    const folderPath = mkdtempSync(nodePath.join(tmpdir(), "krino-report-performance-"));
    createdFolders.push(folderPath);
    const folderSize = writeTraceFolder(folderPath);
    const startedAt = performance.now();
    const reportResult = await createReport(
      {
        projectName: "perf-project",
        sinceText: "2026-09-01",
        traceDirectory: folderPath,
        tokensPerToolText: String(DEFAULT_TOKENS_PER_TOOL_DEFINITION),
      },
      {
        environment: {},
        defaultTraceDirectory: () => folderPath,
        workingDirectory: () => folderPath,
        now: () => new Date("2026-10-02T12:00:00.000Z"),
        modelPrices: DEFAULT_MODEL_PRICES,
      },
    );
    const elapsedMilliseconds = performance.now() - startedAt;
    if (reportResult.resultKind !== "report") {
      throw new Error(reportResult.message);
    }
    console.log(
      `krino report: ${(folderSize / 1024 / 1024).toFixed(1)} MB, ` +
        `${reportResult.report.lines.readLineCount} lines in ${Math.round(elapsedMilliseconds)} ms`,
    );
    expect(reportResult.report.lines.skippedLineCount).toBe(0);
    expect(reportResult.report.records.runCount).toBeGreaterThan(1000);
    expect(elapsedMilliseconds).toBeLessThan(TIME_LIMIT_IN_MILLISECONDS);
  });
});
