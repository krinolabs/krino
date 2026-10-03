import { mkdtempSync, readdirSync } from "node:fs";
import nodePath from "node:path";
import { BENCH_TASKS, type BenchTask } from "@krinolabs/bench";
import { KRINO_CONFIG_DEFAULTS } from "@krinolabs/krino";
import { describe, expect, it } from "vitest";
import { createFakeAgentEnvironment } from "../environment/agent-environment.js";
import type { BenchSetupName, PlannedRun } from "../plan/run-plan.js";
import { aggregateMetrics } from "../scoring/aggregate-metrics.js";
import { scoreRecallAtNeededStep, scoreStepZeroRecall } from "../scoring/scoring.js";
import { projectNameFor, runBenchTask } from "./run-bench-task.js";

function freshTraceDirectory(): string {
  const isolatedDirectory = process.env.KRINO_TRACE_DIRECTORY;
  if (isolatedDirectory === undefined) {
    throw new Error("trace-isolation.ts must set KRINO_TRACE_DIRECTORY");
  }
  return mkdtempSync(nodePath.join(isolatedDirectory, "run-"));
}

function benchTask(taskIdentifier: string): BenchTask {
  const task = BENCH_TASKS.find((candidate) => candidate.taskIdentifier === taskIdentifier);
  if (task === undefined) {
    throw new Error(`no ${taskIdentifier}`);
  }
  return task;
}

// task-059: get_request_trace, then search_application_logs.
const TWO_TOOL_TASK = benchTask("task-059");

function plannedRun(setupName: BenchSetupName, task: BenchTask = TWO_TOOL_TASK): PlannedRun {
  return { runIndex: 0, setupName, toolCount: 25, task, repeatIndex: 0 };
}

async function runFake(setupName: BenchSetupName, task?: BenchTask) {
  const traceDirectory = freshTraceDirectory();
  const runObservation = await runBenchTask({
    plannedRun: plannedRun(setupName, task),
    traceDirectory,
    agentEnvironment: createFakeAgentEnvironment(),
    decisionTimeoutInMilliseconds: KRINO_CONFIG_DEFAULTS.decisionTimeoutInMilliseconds,
  });
  return { runObservation, traceDirectory };
}

/** The fake provider answers after 300 ms; the bench waits 50 ms. */
async function runWithSlowProvider(setupName: BenchSetupName) {
  return runBenchTask({
    plannedRun: plannedRun(setupName),
    traceDirectory: freshTraceDirectory(),
    agentEnvironment: createFakeAgentEnvironment({ decisionLatencyInMilliseconds: 300 }),
    decisionTimeoutInMilliseconds: 50,
  });
}

describe("runBenchTask (fake)", () => {
  it("baseline sends every tool on every step and asks no tool selection", async () => {
    const { runObservation, traceDirectory } = await runFake("baseline");
    expect(runObservation.runStatus).toBe("completed");
    expect(runObservation.steps).toHaveLength(3);
    for (const observedStep of runObservation.steps) {
      expect(observedStep.offeredToolNames).toHaveLength(25);
    }
    expect(runObservation.toolSelectionDecisions).toEqual([]);
    expect(runObservation.availableToolCount).toBe(25);
    expect(runObservation.catalogTokenCount).toBeGreaterThan(0);
    expect(readdirSync(traceDirectory).length).toBeGreaterThan(0);
    expect(runObservation.projectName).toBe(projectNameFor("baseline", 25));
  });

  it("step-zero sends the selected tools on step 0 and never changes them", async () => {
    const { runObservation } = await runFake("step-zero");
    const offeredLists = runObservation.steps.map((observedStep) =>
      [...observedStep.offeredToolNames].sort(),
    );
    expect(offeredLists[0]).toEqual(["get_request_trace", "search_application_logs"]);
    expect(new Set(offeredLists.map((toolNames) => toolNames.join(","))).size).toBe(1);
    expect(runObservation.toolSelectionDecisions).toHaveLength(1);
    expect(runObservation.toolSelectionDecisions[0]).toMatchObject({
      decisionMode: "enforce",
      decisionStatus: "answered",
    });
    const expectedToolNames = TWO_TOOL_TASK.expectedToolNames;
    expect(scoreRecallAtNeededStep(expectedToolNames, runObservation.steps)).toBe(true);
    expect(scoreStepZeroRecall(expectedToolNames, runObservation.steps)).toBe(true);
    // The tool list holds, so every step after step 0 reads the cache.
    for (const observedStep of runObservation.steps.slice(1)) {
      expect(observedStep.tokenUsage?.cacheWriteTokens).toBe(0);
      expect(observedStep.tokenUsage?.cacheReadTokens).toBeGreaterThan(0);
    }
  });

  it("per-step asks on every step, changes the list, and writes the cache again", async () => {
    const { runObservation } = await runFake("per-step");
    expect(runObservation.steps.length).toBeGreaterThanOrEqual(2);
    expect(runObservation.toolSelectionDecisions).toHaveLength(runObservation.steps.length);
    expect([...(runObservation.steps[0]?.offeredToolNames ?? [])].sort()).toEqual([
      "get_request_trace",
      "search_application_logs",
    ]);
    expect(runObservation.steps[1]?.offeredToolNames).toEqual(["search_application_logs"]);
    expect(runObservation.steps[1]?.tokenUsage?.cacheWriteTokens).toBeGreaterThan(0);
    expect(scoreRecallAtNeededStep(TWO_TOOL_TASK.expectedToolNames, runObservation.steps)).toBe(
      true,
    );
  });

  it("records the agent model and prices every step and decision", async () => {
    const { runObservation } = await runFake("step-zero");
    expect(runObservation.agentModelIdentifiers).toEqual(["claude-haiku-4-5"]);
    for (const observedStep of runObservation.steps) {
      expect(observedStep.costInUsd).toBeGreaterThan(0);
    }
    expect(runObservation.toolSelectionDecisions[0]?.decisionCostInUsd).toBeGreaterThan(0);
    expect(runObservation.spentInUsd).toBeGreaterThan(0);
  });
});

describe("runBenchTask with a slow decision provider", () => {
  it("step-zero times out and fails open: every tool on every step", async () => {
    const runObservation = await runWithSlowProvider("step-zero");
    expect(runObservation.toolSelectionDecisions).toHaveLength(1);
    expect(runObservation.toolSelectionDecisions[0]?.decisionStatus).toBe("timedOut");
    for (const observedStep of runObservation.steps) {
      expect(observedStep.offeredToolNames).toHaveLength(25);
    }
  });

  it("per-step times out on every step and fails open", async () => {
    const runObservation = await runWithSlowProvider("per-step");
    expect(runObservation.toolSelectionDecisions.length).toBeGreaterThan(0);
    for (const decisionRecord of runObservation.toolSelectionDecisions) {
      expect(decisionRecord.decisionStatus).toBe("timedOut");
    }
    for (const observedStep of runObservation.steps) {
      expect(observedStep.offeredToolNames).toHaveLength(25);
    }
  });
});

describe("per-step cost includes the router", () => {
  it("counts one router decision per step in the decision cost and the total cost per step", async () => {
    const { runObservation } = await runFake("per-step");
    const stepCount = runObservation.steps.length;
    // The router's decisions are not in the traces; the runner takes them from the router.
    expect(runObservation.toolSelectionDecisions).toHaveLength(stepCount);
    const routerCostInUsd = runObservation.toolSelectionDecisions.reduce(
      (total, decisionRecord) => total + (decisionRecord.decisionCostInUsd ?? 0),
      0,
    );
    for (const decisionRecord of runObservation.toolSelectionDecisions) {
      expect(decisionRecord.decisionCostInUsd).toBeGreaterThan(0);
    }
    const riskGateCostInUsd = runObservation.riskGateDecisions.reduce(
      (total, decisionRecord) => total + (decisionRecord.decisionCostInUsd ?? 0),
      0,
    );
    expect(runObservation.decisionCostInUsd).toBeCloseTo(routerCostInUsd + riskGateCostInUsd, 12);

    const metrics = aggregateMetrics([runObservation]);
    expect(metrics.decisions.decisionCostInUsd).toBeCloseTo(runObservation.decisionCostInUsd, 12);
    // Model-only cost per step leaves the router out; the total includes it.
    expect(metrics.costPerStep?.meanCostInUsd).toBeCloseTo(
      runObservation.agentCostInUsd / stepCount,
      12,
    );
    expect(metrics.costPerStep?.meanTotalCostInUsd).toBeCloseTo(
      (runObservation.agentCostInUsd + runObservation.decisionCostInUsd) / stepCount,
      12,
    );
    expect(
      (metrics.costPerStep?.meanTotalCostInUsd ?? 0) - (metrics.costPerStep?.meanCostInUsd ?? 0),
    ).toBeGreaterThanOrEqual(routerCostInUsd / stepCount - 1e-12);
  });
});
