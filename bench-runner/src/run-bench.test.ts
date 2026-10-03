import { describe, expect, it } from "vitest";
import { createFakeAgentEnvironment } from "./environment/agent-environment.js";
import type { SetupReportResult } from "./report/report-engine.js";
import { type BenchRequest, runBench } from "./run-bench.js";
import type { RunBenchTaskInputs, RunObservation } from "./setups/run-bench-task.js";

// The spend guard, with an injected run that reports a fixed spend. No model, no traces.

const UNAVAILABLE_REPORT: SetupReportResult = { reportKind: "unavailable", reason: "not read" };

function fixedSpendRun(spentInUsd: number, executedRuns: Array<RunBenchTaskInputs>) {
  return async (runInputs: RunBenchTaskInputs): Promise<RunObservation> => {
    executedRuns.push(runInputs);
    const { plannedRun } = runInputs;
    return {
      runIndex: plannedRun.runIndex,
      setupName: plannedRun.setupName,
      toolCount: plannedRun.toolCount,
      taskIdentifier: plannedRun.task.taskIdentifier,
      difficulty: plannedRun.task.difficulty,
      repeatIndex: plannedRun.repeatIndex,
      projectName: `krino-bench-${plannedRun.setupName}-${plannedRun.toolCount}-tools`,
      runStatus: "completed",
      failureText: null,
      expectedToolNames: [...plannedRun.task.expectedToolNames],
      availableToolCount: plannedRun.toolCount,
      catalogTokenCount: 1000,
      steps: [],
      calledToolNames: [],
      toolSelectionDecisions: [],
      riskGateDecisions: [],
      agentModelIdentifiers: [],
      agentCostInUsd: spentInUsd,
      decisionCostInUsd: 0,
      spentInUsd,
    };
  };
}

function benchRequest(maxSpendInUsd: number): BenchRequest {
  return {
    setupNames: ["baseline", "step-zero"],
    runSelection: { selectionKind: "pilot" },
    toolCounts: [10],
    maxSpendInUsd,
    traceDirectory: "unused",
  };
}

describe("runBench spend guard", () => {
  it("refuses to start when the estimate is over the limit, and runs nothing", async () => {
    const executedRuns: Array<RunBenchTaskInputs> = [];
    const outcome = await runBench(benchRequest(0.0001), {
      agentEnvironment: createFakeAgentEnvironment(),
      executeRun: fixedSpendRun(0, executedRuns),
      readReport: async () => UNAVAILABLE_REPORT,
    });
    expect(outcome.outcomeKind).toBe("refusedOverEstimate");
    expect(executedRuns).toEqual([]);
    if (outcome.outcomeKind === "refusedOverEstimate") {
      expect(outcome.estimatedInUsd).toBeGreaterThan(0.0001);
      expect(outcome.message).toContain("Nothing was run");
    }
  });

  it("stops at the limit with a clear message and keeps the finished runs", async () => {
    const executedRuns: Array<RunBenchTaskInputs> = [];
    // Runs cost far more than estimated: the in-run guard is what stops them.
    const outcome = await runBench(benchRequest(1), {
      agentEnvironment: createFakeAgentEnvironment(),
      executeRun: fixedSpendRun(0.3, executedRuns),
      readReport: async () => UNAVAILABLE_REPORT,
    });
    expect(outcome.outcomeKind).toBe("stoppedAtSpendLimit");
    if (outcome.outcomeKind !== "stoppedAtSpendLimit") {
      return;
    }
    // $0.90 after 3 runs, and the 4th fits its (small) estimate; after it, spend has reached
    // the limit. A run that costs more than estimated can overshoot by that one run.
    expect(executedRuns).toHaveLength(4);
    const { spend } = outcome.result;
    expect(spend.stopReason).toBe("spendLimit");
    expect(spend.finishedRunCount).toBe(4);
    expect(spend.plannedRunCount).toBe(20);
    expect(spend.spentInUsd).toBeCloseTo(1.2);
    expect(outcome.result.runs).toHaveLength(executedRuns.length);
    expect(outcome.message).toContain("stopped at the spend limit");
    expect(outcome.message).toContain(`after ${executedRuns.length} of 20 runs`);
  });

  it("records the estimate and finishes every run within the limit", async () => {
    const executedRuns: Array<RunBenchTaskInputs> = [];
    const outcome = await runBench(benchRequest(20), {
      agentEnvironment: createFakeAgentEnvironment(),
      executeRun: fixedSpendRun(0.001, executedRuns),
      readReport: async () => UNAVAILABLE_REPORT,
    });
    expect(outcome.outcomeKind).toBe("completed");
    if (outcome.outcomeKind !== "completed") {
      return;
    }
    expect(executedRuns).toHaveLength(20);
    expect(outcome.result.spend.estimatedInUsd).toBeGreaterThan(0);
    expect(outcome.result.spend.stopReason).toBeNull();
  });
});
