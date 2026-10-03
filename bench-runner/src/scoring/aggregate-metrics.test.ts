import type { DecisionRecord } from "@krinolabs/krino";
import { describe, expect, it } from "vitest";
import type { ObservedAgentStep, RunObservation } from "../setups/run-bench-task.js";
import { aggregateMetrics, groupObservations, percentile } from "./aggregate-metrics.js";

function agentStep(
  stepNumber: number,
  offeredToolNames: Array<string>,
  calledToolNames: Array<string>,
): ObservedAgentStep {
  return {
    stepNumber,
    offeredToolNames,
    calledToolNames,
    modelIdentifier: "claude-haiku-4-5",
    tokenUsage: {
      inputTokens: 100,
      outputTokens: 10,
      cacheReadTokens: stepNumber === 0 ? 0 : 1000,
      cacheWriteTokens: stepNumber === 0 ? 1000 : 0,
    },
    costInUsd: 0.01,
    latencyInMilliseconds: 100 + stepNumber,
  };
}

function selection(probability: number, decisionCostInUsd = 0.001): DecisionRecord {
  return {
    decisionKind: "toolSelection",
    decisionMode: "enforce",
    decisionStatus: "answered",
    suggestedChoice: "a",
    appliedChoice: "a",
    probability,
    decisionModelVersion: "jev",
    latencyInMilliseconds: 50,
    decisionCostInUsd,
  };
}

function observation(overrides: Partial<RunObservation>): RunObservation {
  return {
    runIndex: 0,
    setupName: "step-zero",
    toolCount: 10,
    taskIdentifier: "task-001",
    difficulty: "easy",
    repeatIndex: 0,
    projectName: "krino-bench-step-zero-10-tools",
    runStatus: "completed",
    failureText: null,
    expectedToolNames: ["a"],
    availableToolCount: 10,
    catalogTokenCount: 2000,
    steps: [agentStep(0, ["a", "b"], ["a"]), agentStep(1, ["a", "b"], [])],
    calledToolNames: ["a"],
    toolSelectionDecisions: [selection(0.95)],
    riskGateDecisions: [],
    agentModelIdentifiers: ["claude-haiku-4-5"],
    agentCostInUsd: 0.02,
    decisionCostInUsd: 0.001,
    spentInUsd: 0.021,
    ...overrides,
  };
}

describe("percentile", () => {
  it("uses the nearest rank", () => {
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2);
    expect(percentile([5, 1, 3], 0.95)).toBe(5);
    expect(percentile([], 0.5)).toBeNull();
  });
});

describe("aggregateMetrics", () => {
  it("scores recall, set size, cost per step, latency and decisions", () => {
    const metrics = aggregateMetrics([
      observation({}),
      observation({
        taskIdentifier: "task-002",
        expectedToolNames: ["c"],
        steps: [agentStep(0, ["a"], [])],
        calledToolNames: [],
        toolSelectionDecisions: [selection(0.6)],
      }),
    ]);
    expect(metrics.runCount).toBe(2);
    expect(metrics.selectionRecall).toBe(0.5);
    expect(metrics.stepZeroSelectionRecall).toBe(0.5);
    expect(metrics.setSize.meanKeptShare).toBeCloseTo(0.15);
    expect(metrics.setSize.medianKeptShare).toBeCloseTo(0.15);
    expect(metrics.setSize.meanKeptCount).toBe(1.5);
    expect(metrics.setSize.meanAvailableToolCount).toBe(10);
    expect(metrics.costPerStep?.meanCostInUsd).toBeCloseTo(0.01);
    expect(metrics.costPerStep?.meanCacheReadTokens).toBeCloseTo(1000 / 3);
    expect(metrics.costPerStep?.meanCacheWriteTokens).toBeCloseTo(2000 / 3);
    expect(metrics.decisions.toolSelectionCount).toBe(2);
    expect(metrics.decisions.confidentSelectionShare).toBe(0.5);
    expect(metrics.decisions.timedOutSelectionShare).toBe(0);
    expect(metrics.decisions.decisionCostInUsd).toBeCloseTo(0.002);
    expect(metrics.stepLatencyInMilliseconds).toEqual({ p50: 100, p95: 101 });
    expect(metrics.multiStep).toEqual({
      runCount: 0,
      sequenceMatch: null,
      meanExtraCallCount: null,
    });
  });

  it("scores sequence match and extra calls for multiStep runs only", () => {
    const metrics = aggregateMetrics([
      observation({
        difficulty: "multiStep",
        expectedToolNames: ["a", "b"],
        steps: [agentStep(0, ["a", "b"], ["a"]), agentStep(1, ["a", "b"], ["a", "b"])],
        calledToolNames: ["a", "a", "b"],
      }),
      observation({ difficulty: "easy", calledToolNames: ["a", "x", "y"] }),
    ]);
    expect(metrics.multiStep).toEqual({ runCount: 1, sequenceMatch: 1, meanExtraCallCount: 1 });
  });

  it("reports the share of tool selections that timed out (and failed open)", () => {
    const timedOut: DecisionRecord = {
      ...selection(0.95),
      decisionStatus: "timedOut",
      suggestedChoice: null,
      probability: null,
    };
    const metrics = aggregateMetrics([
      observation({ toolSelectionDecisions: [timedOut, selection(0.95)] }),
      observation({ toolSelectionDecisions: [timedOut, timedOut] }),
    ]);
    expect(metrics.decisions.toolSelectionCount).toBe(4);
    expect(metrics.decisions.timedOutSelectionShare).toBe(0.75);
    expect(metrics.decisions.confidentSelectionShare).toBe(0.25);
  });

  it("leaves failed runs out of the scores and counts them", () => {
    const metrics = aggregateMetrics([
      observation({}),
      observation({ runStatus: "failed", failureText: "APICallError: 529", steps: [] }),
    ]);
    expect(metrics.runCount).toBe(2);
    expect(metrics.failedRunCount).toBe(1);
    expect(metrics.selectionRecall).toBe(1);
  });

  it("reports null, not zero, when there is nothing to score", () => {
    const metrics = aggregateMetrics([]);
    expect(metrics.selectionRecall).toBeNull();
    expect(metrics.decisions.confidentSelectionShare).toBeNull();
    expect(metrics.decisions.timedOutSelectionShare).toBeNull();
    expect(metrics.costPerStep).toBeNull();
  });
});

describe("groupObservations", () => {
  it("groups by setup and tool count, then by difficulty and by stable task id", () => {
    const groups = groupObservations([
      observation({ taskIdentifier: "task-002" }),
      observation({ taskIdentifier: "task-001", repeatIndex: 1 }),
      observation({ taskIdentifier: "task-001" }),
      observation({ setupName: "baseline", projectName: "krino-bench-baseline-10-tools" }),
    ]);
    expect(groups.map((group) => `${group.setupName}/${group.toolCount}`)).toEqual([
      "baseline/10",
      "step-zero/10",
    ]);
    const stepZero = groups[1];
    expect(stepZero?.byTask.map((taskMetrics) => taskMetrics.taskIdentifier)).toEqual([
      "task-001",
      "task-002",
    ]);
    expect(stepZero?.byTask[0]?.runCount).toBe(2);
    expect(stepZero?.byDifficulty.easy.runCount).toBe(3);
    expect(stepZero?.byDifficulty.multiStep.runCount).toBe(0);
  });

  it("keys tasks by id, so prototype names are plain ids", () => {
    const groups = groupObservations([
      observation({ taskIdentifier: "__proto__" }),
      observation({ taskIdentifier: "constructor" }),
      observation({ taskIdentifier: "toString" }),
    ]);
    expect(groups[0]?.byTask.map((taskMetrics) => taskMetrics.taskIdentifier)).toEqual([
      "__proto__",
      "constructor",
      "toString",
    ]);
  });
});
