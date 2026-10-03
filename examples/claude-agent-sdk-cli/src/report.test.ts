import { type SpawnSyncReturns, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import nodePath from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { PROJECT_NAME } from "./log-triage.js";
import { DEFAULT_TASK_IDENTIFIER, resolveExampleTask } from "./log-triage-tasks.js";

// The README flow: run the example with --fake, then `krino report --trace-dir <folder>`.
// Both run as built CLIs; turbo builds them before `test`.

const HOST_NAME = "claude-agent-sdk";
const MAIN_ENTRY = fileURLToPath(new URL("../dist/main.js", import.meta.url));
const KRINO_CLI_ENTRY = nodePath.join(
  nodePath.dirname(createRequire(import.meta.url).resolve("@krinolabs/cli/package.json")),
  "dist",
  "index.js",
);

/** The fields of `krino report --json` (reportSchemaVersion 1) these tests read. */
type ReportJson = {
  reportSchemaVersion: number;
  lines: { validLineCount: number; skippedLineCount: number };
  records: {
    agentStepCount: number;
    runSummaryCount: number;
    runCount: number;
    projectNames: Array<string>;
  };
  decisions: Array<{
    decisionKind: string;
    decisionMode: string;
    statusCounts: { answered: number };
    agreementByHost: Array<{ hostName: string; agreementRate: number | null }>;
    suggestionsByHost: Array<{ hostName: string; allow: number; askHuman: number; block: number }>;
    costSavedIfEnforced: { grossSavingInUsd: number | null };
    decisionLatencyInMilliseconds: { p50: number | null; p95: number | null };
  }>;
};

type ReportedRun = { traceDirectory: string; report: ReportJson };

function runNode(argumentList: Array<string>): SpawnSyncReturns<string> {
  const childEnvironment: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: "1" };
  delete childEnvironment.AI_GATEWAY_API_KEY;
  delete childEnvironment.ANTHROPIC_API_KEY;
  return spawnSync(process.execPath, argumentList, { encoding: "utf8", env: childEnvironment });
}

/** Runs the example with --fake for one task, then `krino report --json` on its traces. */
function runAndReport(taskIdentifier: string): ReportedRun {
  const isolatedDirectory = process.env.KRINO_TRACE_DIRECTORY;
  if (isolatedDirectory === undefined) {
    throw new Error("trace-isolation.ts must set KRINO_TRACE_DIRECTORY");
  }
  const traceDirectory = mkdtempSync(nodePath.join(isolatedDirectory, `report-${taskIdentifier}-`));
  const exampleRun = runNode([
    MAIN_ENTRY,
    "--fake",
    "--task",
    taskIdentifier,
    "--trace-dir",
    traceDirectory,
  ]);
  expect(exampleRun.status, exampleRun.stderr).toBe(0);

  const reportRun = runNode([KRINO_CLI_ENTRY, "report", "--json", "--trace-dir", traceDirectory]);
  expect(reportRun.status, reportRun.stderr).toBe(0);
  return { traceDirectory, report: JSON.parse(reportRun.stdout) as ReportJson };
}

function findDecision(report: ReportJson, decisionKind: string) {
  return report.decisions.find((decision) => decision.decisionKind === decisionKind);
}

function readTraceText(traceDirectory: string): string {
  return readdirSync(traceDirectory)
    .map((fileName) => readFileSync(nodePath.join(traceDirectory, fileName), "utf8"))
    .join("\n");
}

describe("krino report on the claude-agent-sdk-cli traces: default read-only task", () => {
  let reportedRun: ReportedRun;
  beforeAll(() => {
    reportedRun = runAndReport(DEFAULT_TASK_IDENTIFIER);
  });

  it("reads every line as one run of this project", () => {
    const { report } = reportedRun;
    expect(report.reportSchemaVersion).toBe(1);
    expect(report.lines.skippedLineCount).toBe(0);
    expect(report.lines.validLineCount).toBe(4);
    expect(report.records).toEqual({
      agentStepCount: 3,
      runSummaryCount: 1,
      runCount: 1,
      projectNames: [PROJECT_NAME],
    });
  });

  it("shows the shadow tool selection, fully in agreement with the tools used", () => {
    const toolSelection = findDecision(reportedRun.report, "toolSelection");
    expect(toolSelection?.decisionMode).toBe("shadow");
    expect(toolSelection?.statusCounts.answered).toBeGreaterThan(0);
    expect(toolSelection?.agreementByHost).toEqual([
      expect.objectContaining({ hostName: HOST_NAME, agreementRate: 1 }),
    ]);
    expect(toolSelection?.costSavedIfEnforced.grossSavingInUsd).toBeGreaterThan(0);
  });

  it("allows both read-only tool calls by policy, without asking the provider", () => {
    const riskGate = findDecision(reportedRun.report, "riskGate");
    expect(riskGate?.decisionMode).toBe("shadow");
    expect(riskGate?.suggestionsByHost).toEqual([
      expect.objectContaining({ hostName: HOST_NAME, allow: 2, askHuman: 0, block: 0 }),
    ]);
    // alwaysAllowedToolNames answers in code: no provider call, so no decision latency.
    expect(riskGate?.decisionLatencyInMilliseconds).toEqual({ p50: null, p95: null });
  });

  it("prints the text report the README shows", () => {
    const reportRun = runNode([
      KRINO_CLI_ENTRY,
      "report",
      "--trace-dir",
      reportedRun.traceDirectory,
    ]);

    expect(reportRun.status, reportRun.stderr).toBe(0);
    expect(reportRun.stdout).toContain(reportedRun.traceDirectory);
  });

  it("keeps the task text out of the traces (redaction is on)", () => {
    const traceText = readTraceText(reportedRun.traceDirectory);
    expect(traceText).not.toContain(resolveExampleTask(DEFAULT_TASK_IDENTIFIER).taskText);
    expect(traceText).not.toContain("REQ-7f3a");
  });
});

describe("krino report on the claude-agent-sdk-cli traces: --task task-052 (calls a write tool)", () => {
  let reportedRun: ReportedRun;
  beforeAll(() => {
    reportedRun = runAndReport("task-052");
  });

  it("reads every line as one run of this project", () => {
    expect(reportedRun.report.lines.skippedLineCount).toBe(0);
    expect(reportedRun.report.records.runCount).toBe(1);
    expect(reportedRun.report.records.agentStepCount).toBe(3);
  });

  it("allows the read-only call and suggests askHuman for the ticket", () => {
    const riskGate = findDecision(reportedRun.report, "riskGate");
    expect(riskGate?.decisionMode).toBe("shadow");
    expect(riskGate?.suggestionsByHost).toEqual([
      expect.objectContaining({ hostName: HOST_NAME, allow: 1, askHuman: 1, block: 0 }),
    ]);
  });

  it("shows a decision latency: the provider was asked about the write", () => {
    const riskGate = findDecision(reportedRun.report, "riskGate");
    expect(riskGate?.decisionLatencyInMilliseconds.p50).toEqual(expect.any(Number));
    expect(riskGate?.decisionLatencyInMilliseconds.p50).toBeGreaterThan(0);
  });

  it("keeps the task text out of the traces (redaction is on)", () => {
    const traceText = readTraceText(reportedRun.traceDirectory);
    expect(traceText).not.toContain(resolveExampleTask("task-052").taskText);
    expect(traceText).not.toContain("WH-EP-3");
  });
});
