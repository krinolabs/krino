import { mkdtempSync } from "node:fs";
import nodePath from "node:path";
import { BENCH_TASKS } from "@krinolabs/bench";
import { KRINO_CONFIG_DEFAULTS } from "@krinolabs/krino";
import { describe, expect, it } from "vitest";
import { createFakeAgentEnvironment } from "../environment/agent-environment.js";
import { runBenchTask } from "../setups/run-bench-task.js";
import { parseReportSummary, readSetupReport } from "./report-engine.js";

function freshTraceDirectory(): string {
  const isolatedDirectory = process.env.KRINO_TRACE_DIRECTORY;
  if (isolatedDirectory === undefined) {
    throw new Error("trace-isolation.ts must set KRINO_TRACE_DIRECTORY");
  }
  return mkdtempSync(nodePath.join(isolatedDirectory, "report-"));
}

describe("readSetupReport", () => {
  it("reads one setup's cache health through krino report", async () => {
    const traceDirectory = freshTraceDirectory();
    const startedAt = new Date(Date.now() - 1000);
    const task = BENCH_TASKS.find((candidate) => candidate.taskIdentifier === "task-059");
    if (task === undefined) {
      throw new Error("no task-059");
    }
    const runObservation = await runBenchTask({
      plannedRun: { runIndex: 0, setupName: "step-zero", toolCount: 25, task, repeatIndex: 0 },
      traceDirectory,
      agentEnvironment: createFakeAgentEnvironment(),
      decisionTimeoutInMilliseconds: KRINO_CONFIG_DEFAULTS.decisionTimeoutInMilliseconds,
    });

    const reportResult = await readSetupReport({
      projectName: runObservation.projectName,
      since: startedAt,
      traceDirectory,
    });

    expect(reportResult.reportKind).toBe("read");
    if (reportResult.reportKind !== "read") {
      return;
    }
    const { summary } = reportResult;
    expect(summary.reportSchemaVersion).toBe(1);
    expect(summary.runCount).toBe(1);
    expect(summary.agentStepCount).toBe(runObservation.steps.length);
    const tracedUsage = runObservation.steps.flatMap((observedStep) =>
      observedStep.tokenUsage === null ? [] : [observedStep.tokenUsage],
    );
    const cacheReadTokens = tracedUsage.reduce((total, usage) => total + usage.cacheReadTokens, 0);
    const totalInputTokens = tracedUsage.reduce(
      (total, usage) => total + usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens,
      0,
    );
    expect(summary.cacheReadShare).toBeCloseTo(cacheReadTokens / totalInputTokens);
    expect(summary.multiStepRunCount).toBe(1);
    expect(summary.multiStepCacheReadShare).toBeCloseTo(cacheReadTokens / totalInputTokens);
  });

  it("says why when the report cannot be read", async () => {
    const reportResult = await readSetupReport({
      projectName: "krino-bench-baseline-100-tools",
      since: new Date(),
      traceDirectory: freshTraceDirectory(),
      cliEntryPath: nodePath.join(freshTraceDirectory(), "missing-cli.js"),
    });
    expect(reportResult.reportKind).toBe("unavailable");
  });
});

describe("parseReportSummary", () => {
  it("rejects a report with another schema version or a missing field", () => {
    expect(parseReportSummary({ reportSchemaVersion: 2 })).toBeNull();
    expect(parseReportSummary({ reportSchemaVersion: 1 })).toBeNull();
    expect(parseReportSummary(JSON.parse('{"__proto__": {"reportSchemaVersion": 1}}'))).toBeNull();
  });
});
