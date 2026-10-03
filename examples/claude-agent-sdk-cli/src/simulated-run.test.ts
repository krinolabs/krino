import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import nodePath from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { toClaudeAgentSdkToolName } from "@krinolabs/bench/claude-agent-sdk";
import type { AgentStepTrace, RunSummaryTrace } from "@krinolabs/krino";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_TASK_IDENTIFIER, resolveExampleTask } from "./log-triage-tasks.js";
import { runSimulatedLogTriage } from "./simulated-run.js";

vi.mock("@anthropic-ai/claude-agent-sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@anthropic-ai/claude-agent-sdk")>()),
  query: vi.fn(() => {
    throw new Error("--fake must not call query()");
  }),
}));

const defaultTask = resolveExampleTask(DEFAULT_TASK_IDENTIFIER);
const writeTask = resolveExampleTask("task-052");

type TraceRecord = AgentStepTrace | RunSummaryTrace;

function freshTraceDirectory(): string {
  const isolatedDirectory = process.env.KRINO_TRACE_DIRECTORY;
  if (isolatedDirectory === undefined) {
    throw new Error("trace-isolation.ts must set KRINO_TRACE_DIRECTORY");
  }
  return mkdtempSync(nodePath.join(isolatedDirectory, "simulated-run-"));
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

describe("runSimulatedLogTriage", () => {
  it("never calls query() and makes no network call", async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error("--fake must not use the network");
    });
    vi.stubGlobal("fetch", fetchSpy);

    await runSimulatedLogTriage({
      traceDirectory: freshTraceDirectory(),
      toolCount: 100,
      task: defaultTask,
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it("triages the failed request with the two log tools, then answers", async () => {
    const triageResult = await runSimulatedLogTriage({
      traceDirectory: freshTraceDirectory(),
      toolCount: 100,
      task: defaultTask,
    });

    expect(triageResult.usedToolNames).toEqual(defaultTask.expectedToolNames);
    expect(triageResult.turnCount).toBe(3);
    expect(triageResult.answerText).toContain("REQ-7f3a");
  });

  it("runs krino's PreToolUse hook for each tool call, as the SDK would", async () => {
    const traceDirectory = freshTraceDirectory();

    await runSimulatedLogTriage({ traceDirectory, toolCount: 100, task: defaultTask });

    const riskGateDecisions = readTraceRecords(traceDirectory)
      .filter((record): record is AgentStepTrace => record.recordType === "agentStep")
      .flatMap((stepRecord) => stepRecord.decisions)
      .filter((decisionRecord) => decisionRecord.decisionKind === "riskGate");
    expect(riskGateDecisions).toHaveLength(2);
  });

  it("writes every step and the run summary before it returns", async () => {
    const traceDirectory = freshTraceDirectory();

    await runSimulatedLogTriage({ traceDirectory, toolCount: 100, task: defaultTask });

    const traceRecords = readTraceRecords(traceDirectory);
    const summaryRecords = traceRecords.filter((record) => record.recordType === "runSummary");
    expect(traceRecords.filter((record) => record.recordType === "agentStep")).toHaveLength(3);
    expect(summaryRecords).toHaveLength(1);
    expect(summaryRecords[0]?.hostName).toBe("claude-agent-sdk");
    expect(summaryRecords[0]?.usedToolNames).toEqual(
      defaultTask.expectedToolNames.map(toClaudeAgentSdkToolName),
    );
  });

  it.each([10, 25, 50, 100] as const)("offers %i tools with --tools", async (toolCount) => {
    const traceDirectory = freshTraceDirectory();

    await runSimulatedLogTriage({ traceDirectory, toolCount, task: defaultTask });

    const stepZero = readTraceRecords(traceDirectory).find(
      (record): record is AgentStepTrace =>
        record.recordType === "agentStep" && record.stepNumber === 0,
    );
    expect(stepZero?.availableToolNames).toHaveLength(toolCount);
    expect(stepZero?.availableToolNames).toEqual(
      expect.arrayContaining(defaultTask.expectedToolNames.map(toClaudeAgentSdkToolName)),
    );
  });

  it("runs the write task: the read-only call is allowed, the ticket goes to askHuman", async () => {
    const traceDirectory = freshTraceDirectory();

    const triageResult = await runSimulatedLogTriage({
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
