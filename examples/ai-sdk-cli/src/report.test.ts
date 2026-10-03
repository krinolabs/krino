import { type SpawnSyncReturns, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import nodePath from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { LOG_TRIAGE_TASK_TEXT, PROJECT_NAME } from "./log-triage.js";

// The README flow: run the example with --fake, then `krino report --trace-dir <folder>`.
// Both run as built CLIs; turbo builds them before `test`.

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
    suggestionsByHost: Array<{ hostName: string; allow: number }>;
    costSavedIfEnforced: { grossSavingInUsd: number | null };
  }>;
};

function runNode(argumentList: Array<string>): SpawnSyncReturns<string> {
  const childEnvironment: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: "1" };
  delete childEnvironment.AI_GATEWAY_API_KEY;
  delete childEnvironment.ANTHROPIC_API_KEY;
  return spawnSync(process.execPath, argumentList, { encoding: "utf8", env: childEnvironment });
}

function findDecision(report: ReportJson, decisionKind: string) {
  return report.decisions.find((decision) => decision.decisionKind === decisionKind);
}

let traceDirectory = "";
let report: ReportJson;

beforeAll(() => {
  const isolatedDirectory = process.env.KRINO_TRACE_DIRECTORY;
  if (isolatedDirectory === undefined) {
    throw new Error("trace-isolation.ts must set KRINO_TRACE_DIRECTORY");
  }
  traceDirectory = mkdtempSync(nodePath.join(isolatedDirectory, "report-"));
  const exampleRun = runNode([MAIN_ENTRY, "--fake", "--trace-dir", traceDirectory]);
  expect(exampleRun.status, exampleRun.stderr).toBe(0);

  const reportRun = runNode([KRINO_CLI_ENTRY, "report", "--json", "--trace-dir", traceDirectory]);
  expect(reportRun.status, reportRun.stderr).toBe(0);
  report = JSON.parse(reportRun.stdout) as ReportJson;
});

describe("krino report on the ai-sdk-cli traces", () => {
  it("reads every line as one run of this project", () => {
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
    const toolSelection = findDecision(report, "toolSelection");
    expect(toolSelection?.decisionMode).toBe("shadow");
    expect(toolSelection?.statusCounts.answered).toBeGreaterThan(0);
    expect(toolSelection?.agreementByHost).toEqual([
      expect.objectContaining({ hostName: "ai-sdk", agreementRate: 1 }),
    ]);
    expect(toolSelection?.costSavedIfEnforced.grossSavingInUsd).toBeGreaterThan(0);
  });

  it("shows a shadow risk-gate suggestion for each tool call", () => {
    const riskGate = findDecision(report, "riskGate");
    expect(riskGate?.decisionMode).toBe("shadow");
    expect(riskGate?.suggestionsByHost).toEqual([
      expect.objectContaining({ hostName: "ai-sdk", allow: 2 }),
    ]);
  });

  it("prints the text report the README shows", () => {
    const reportRun = runNode([KRINO_CLI_ENTRY, "report", "--trace-dir", traceDirectory]);

    expect(reportRun.status, reportRun.stderr).toBe(0);
    expect(reportRun.stdout).toContain(traceDirectory);
  });

  it("keeps the task text out of the traces (redaction is on)", () => {
    const traceText = readdirSync(traceDirectory)
      .map((fileName) => readFileSync(nodePath.join(traceDirectory, fileName), "utf8"))
      .join("\n");
    expect(traceText).not.toContain(LOG_TRIAGE_TASK_TEXT);
    expect(traceText).not.toContain("REQ-7f3a");
  });
});
