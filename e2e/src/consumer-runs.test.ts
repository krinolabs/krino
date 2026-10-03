import { mkdtemp } from "node:fs/promises";
import nodePath from "node:path";
import { beforeAll, describe, expect, inject, it } from "vitest";
import "./e2e-context.js";
import { runConsumerScript, runInstalledKrino } from "./consumer/consumer-commands.js";
import { readTraceRecords, type TraceRecordFields } from "./consumer/read-trace-records.js";
import type { CommandResult } from "./setup/run-command.js";

// A user's project, installed from the tarballs: an AI SDK run (mock model) and an Agent SDK run
// (simulated message stream), both with the fake decision provider, then the installed CLI's
// `krino report --json` and `krino doctor` over the traces they wrote.

const e2eContext = inject("e2eContext");
const consumer = e2eContext.consumerWithHostSdks;

type HostRunOutput = { usedToolNames: Array<string>; answerText: string };

/** The `krino report --json` fields these tests read (`packages/cli/src/report/report-types.ts`). */
type ReportFields = {
  reportSchemaVersion: number;
  filters: { traceDirectory: string };
  lines: { skippedLineCount: number };
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
  }>;
  cacheHealth: { byHost: Array<{ hostName: string }> };
};

let traceDirectory = "";
let aiSdkRun: CommandResult;
let agentSdkRun: CommandResult;
let traceRecords: Array<TraceRecordFields>;

beforeAll(async () => {
  traceDirectory = await mkdtemp(nodePath.join(consumer.directory, "traces-hosts-"));
  aiSdkRun = await runConsumerScript(consumer, "src/ai-sdk-run.ts", [traceDirectory]);
  agentSdkRun = await runConsumerScript(consumer, "src/agent-sdk-run.ts", [traceDirectory]);
  traceRecords = await readTraceRecords(traceDirectory);
});

function hostRunOutput(commandResult: CommandResult): HostRunOutput {
  expect(commandResult.exitCode, commandResult.stderr).toBe(0);
  return JSON.parse(commandResult.stdout);
}

describe("host runs in the consumer project", () => {
  it("runs generateText with withKrino, the AI SDK mock model and the fake provider", () => {
    expect(hostRunOutput(aiSdkRun)).toEqual({
      usedToolNames: ["searchLogs", "getLogEntry"],
      answerText: "The checkout service ran out of memory at 09:14.",
    });
  });

  it("runs a simulated Agent SDK stream through krinoAgentOptions and observeKrinoMessages", () => {
    expect(hostRunOutput(agentSdkRun)).toEqual({
      usedToolNames: ["mcp__logs__searchLogs", "mcp__logs__getLogEntry"],
      answerText: "The checkout service ran out of memory at 09:14.",
    });
  });

  it("writes one run summary per host, and steps for both", () => {
    const runSummaryHosts = traceRecords
      .filter((traceRecord) => traceRecord.recordType === "runSummary")
      .map((traceRecord) => traceRecord.hostName)
      .sort();
    expect(runSummaryHosts).toEqual(["ai-sdk", "claude-agent-sdk"]);
    const stepHosts = new Set(
      traceRecords
        .filter((traceRecord) => traceRecord.recordType === "agentStep")
        .map((traceRecord) => traceRecord.hostName),
    );
    expect([...stepHosts].sort()).toEqual(["ai-sdk", "claude-agent-sdk"]);
  });
});

describe("the installed krino CLI", () => {
  it("krino report --json counts both runs, their steps and both hosts", async () => {
    const reportResult = await runInstalledKrino(consumer, [
      "report",
      "--json",
      "--trace-dir",
      traceDirectory,
    ]);
    expect(reportResult.exitCode, reportResult.stderr).toBe(0);
    const report: ReportFields = JSON.parse(reportResult.stdout);
    const agentStepCount = traceRecords.filter(
      (traceRecord) => traceRecord.recordType === "agentStep",
    ).length;
    expect(report.reportSchemaVersion).toBe(1);
    expect(report.filters.traceDirectory).toBe(traceDirectory);
    expect(report.lines.skippedLineCount).toBe(0);
    expect(report.records).toMatchObject({
      runCount: 2,
      runSummaryCount: 2,
      agentStepCount,
      projectNames: ["e2e-consumer"],
    });
    // The AI SDK run has three steps; the Agent SDK run at least one.
    expect(agentStepCount).toBeGreaterThanOrEqual(4);
    const cacheHosts = report.cacheHealth.byHost.map((hostShares) => hostShares.hostName);
    expect(cacheHosts.sort()).toEqual(["ai-sdk", "claude-agent-sdk"]);
    const toolSelection = report.decisions.find(
      (decisionReport) => decisionReport.decisionKind === "toolSelection",
    );
    expect(toolSelection?.decisionMode).toBe("shadow");
    expect(toolSelection?.statusCounts.answered).toBe(2);
    // The good fake provider suggested exactly the tools each run used.
    expect(toolSelection?.agreementByHost).toHaveLength(2);
    expect(toolSelection?.agreementByHost).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ hostName: "ai-sdk", agreementRate: 1 }),
        expect.objectContaining({ hostName: "claude-agent-sdk", agreementRate: 1 }),
      ]),
    );
  });

  it("krino doctor passes with no failed checks", async () => {
    const doctorResult = await runInstalledKrino(consumer, [
      "doctor",
      "--trace-dir",
      traceDirectory,
    ]);
    expect(doctorResult.exitCode, doctorResult.stdout).toBe(0);
    expect(doctorResult.stdout).toContain("krino doctor");
    expect(doctorResult.stdout).toMatch(/\b0 fail\b/);
    // Doctor finds both host SDKs in the consumer and reads both runs.
    expect(doctorResult.stdout).toMatch(/PASS\s+ai\s/);
    expect(doctorResult.stdout).toMatch(/PASS\s+@anthropic-ai\/claude-agent-sdk\s/);
    expect(doctorResult.stdout).toContain("2 runs");
  });
});
