import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import nodePath from "node:path";
import type { AgentStepTrace, RunSummaryTrace } from "@krinolabs/krino";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runFakeLogTriage } from "./fake-run.js";
import { DEFAULT_TASK_IDENTIFIER, resolveExampleTask } from "./log-triage-tasks.js";

const defaultTask = resolveExampleTask(DEFAULT_TASK_IDENTIFIER);
const writeTask = resolveExampleTask("task-052");

type TraceRecord = AgentStepTrace | RunSummaryTrace;

function freshTraceDirectory(): string {
  const isolatedDirectory = process.env.KRINO_TRACE_DIRECTORY;
  if (isolatedDirectory === undefined) {
    throw new Error("trace-isolation.ts must set KRINO_TRACE_DIRECTORY");
  }
  return mkdtempSync(nodePath.join(isolatedDirectory, "fake-run-"));
}

function readTraceRecords(traceDirectory: string): Array<TraceRecord> {
  return readdirSync(traceDirectory)
    .filter((fileName) => fileName.endsWith(".jsonl"))
    .flatMap((fileName) =>
      readFileSync(nodePath.join(traceDirectory, fileName), "utf8")
        .split("\n")
        .filter((line) => line.trim() !== "")
        .map((line) => JSON.parse(line) as TraceRecord),
    );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("runFakeLogTriage", () => {
  it("makes no network call", async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error("--fake must not use the network");
    });
    vi.stubGlobal("fetch", fetchSpy);

    await runFakeLogTriage({
      traceDirectory: freshTraceDirectory(),
      toolCount: 100,
      task: defaultTask,
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("triages the failed request with the two log tools, then answers", async () => {
    const triageResult = await runFakeLogTriage({
      traceDirectory: freshTraceDirectory(),
      toolCount: 100,
      task: defaultTask,
    });

    expect(triageResult.usedToolNames).toEqual(defaultTask.expectedToolNames);
    expect(triageResult.stepCount).toBe(3);
    expect(triageResult.answerText).toContain("REQ-7f3a");
  });

  it("writes every step and the run summary before it returns", async () => {
    const traceDirectory = freshTraceDirectory();

    await runFakeLogTriage({ traceDirectory, toolCount: 100, task: defaultTask });

    const traceRecords = readTraceRecords(traceDirectory);
    const stepRecords = traceRecords.filter((record) => record.recordType === "agentStep");
    const summaryRecords = traceRecords.filter((record) => record.recordType === "runSummary");
    expect(stepRecords).toHaveLength(3);
    expect(summaryRecords).toHaveLength(1);
    expect(summaryRecords[0]?.hostName).toBe("ai-sdk");
  });

  it.each([10, 25, 50, 100] as const)("offers %i tools with --tools", async (toolCount) => {
    const traceDirectory = freshTraceDirectory();

    await runFakeLogTriage({ traceDirectory, toolCount, task: defaultTask });

    const stepRecords = readTraceRecords(traceDirectory).filter(
      (record): record is AgentStepTrace => record.recordType === "agentStep",
    );
    expect(stepRecords.length).toBeGreaterThan(0);
    for (const stepRecord of stepRecords) {
      expect(stepRecord.availableToolNames).toHaveLength(toolCount);
      expect(stepRecord.availableToolNames).toEqual(
        expect.arrayContaining([...defaultTask.expectedToolNames]),
      );
    }
  });

  it("runs the write task: the read-only call is allowed, the ticket goes to askHuman", async () => {
    const traceDirectory = freshTraceDirectory();

    const triageResult = await runFakeLogTriage({
      traceDirectory,
      toolCount: 100,
      task: writeTask,
    });

    expect(triageResult.usedToolNames).toEqual([
      "get_webhook_delivery_log",
      "create_support_ticket",
    ]);
    expect(triageResult.answerText).toContain("WH-EP-3");
    const riskGateDecisions = readTraceRecords(traceDirectory)
      .filter((record): record is AgentStepTrace => record.recordType === "agentStep")
      .flatMap((stepRecord) => stepRecord.decisions)
      .filter((decisionRecord) => decisionRecord.decisionKind === "riskGate");
    expect(
      riskGateDecisions.map((decisionRecord) => decisionRecord.suggestedChoice).sort(),
    ).toEqual(["allow", "askHuman"]);
  });
});
