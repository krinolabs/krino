import { BENCH_TASKS, type BenchTask } from "@krinolabs/bench";
import { DEFAULT_MODEL_PRICES, findModelPrice, type ModelPrice } from "@krinolabs/krino";
import { describe, expect, it } from "vitest";
import type { BenchSetupName } from "../plan/run-plan.js";
import { estimateRunCostInUsd } from "./spend-estimate.js";
import { checkEstimate, shouldStopBeforeRun, spendLimitStopMessage } from "./spend-guard.js";

function priceOf(modelIdentifier: string): ModelPrice {
  const modelPrice = findModelPrice(modelIdentifier, DEFAULT_MODEL_PRICES);
  if (modelPrice === null) {
    throw new Error(`no price for ${modelIdentifier}`);
  }
  return modelPrice;
}

function taskById(taskIdentifier: string): BenchTask {
  const task = BENCH_TASKS.find((candidate) => candidate.taskIdentifier === taskIdentifier);
  if (task === undefined) {
    throw new Error(`no ${taskIdentifier}`);
  }
  return task;
}

function estimate(setupName: BenchSetupName, toolCount: 10 | 100, taskIdentifier = "task-041") {
  return estimateRunCostInUsd({
    setupName,
    toolCount,
    task: taskById(taskIdentifier),
    agentModelPrice: priceOf("claude-haiku-4-5"),
    decisionModelPrice: priceOf("typesafe-ai/jev"),
  });
}

describe("estimateRunCostInUsd", () => {
  it("prices a 100-tool baseline run at about a cent or more (cache write on step 0)", () => {
    // 18.7k-token prefix written once at $1.25/M is about $0.023 before the margin.
    expect(estimate("baseline", 100)).toBeGreaterThan(0.02);
    expect(estimate("baseline", 100)).toBeLessThan(0.2);
  });

  it("grows with the tool count", () => {
    expect(estimate("baseline", 100)).toBeGreaterThan(estimate("baseline", 10));
  });

  it("charges step-zero one decision and per-step one per step", () => {
    expect(estimate("per-step", 100)).toBeGreaterThan(estimate("step-zero", 100));
    expect(estimate("step-zero", 100)).toBeGreaterThan(estimate("baseline", 100));
  });

  it("is zero without prices, not NaN", () => {
    expect(
      estimateRunCostInUsd({
        setupName: "per-step",
        toolCount: 100,
        task: taskById("task-001"),
        agentModelPrice: null,
        decisionModelPrice: null,
      }),
    ).toBe(0);
  });
});

describe("checkEstimate", () => {
  it("lets a run within the limit start", () => {
    expect(checkEstimate({ estimatedInUsd: 5, limitInUsd: 20, pilotEstimateInUsd: 1 })).toEqual({
      withinLimit: true,
    });
  });

  it("refuses an estimate over the limit, shows it, and suggests --pilot or a higher limit", () => {
    const estimateCheck = checkEstimate({
      estimatedInUsd: 31.2,
      limitInUsd: 20,
      pilotEstimateInUsd: 2.6,
    });
    expect(estimateCheck.withinLimit).toBe(false);
    if (estimateCheck.withinLimit) {
      return;
    }
    expect(estimateCheck.message).toContain("$31.20");
    expect(estimateCheck.message).toContain("--max-spend-usd $20.00");
    expect(estimateCheck.message).toContain("--pilot (estimated $2.60)");
    expect(estimateCheck.message).toContain("Nothing was run");
  });

  it("leaves out the pilot hint when the pilot is what was asked for", () => {
    const estimateCheck = checkEstimate({
      estimatedInUsd: 3,
      limitInUsd: 1,
      pilotEstimateInUsd: null,
    });
    expect(estimateCheck.withinLimit).toBe(false);
    expect(estimateCheck.withinLimit ? "" : estimateCheck.message).not.toContain("--pilot");
  });
});

describe("shouldStopBeforeRun", () => {
  it("stops once spend reaches the limit", () => {
    expect(shouldStopBeforeRun({ spentInUsd: 20, nextRunEstimateInUsd: 0, limitInUsd: 20 })).toBe(
      true,
    );
  });

  it("stops when the next run would go over the limit", () => {
    expect(
      shouldStopBeforeRun({ spentInUsd: 19.9, nextRunEstimateInUsd: 0.2, limitInUsd: 20 }),
    ).toBe(true);
  });

  it("keeps going while the next run fits", () => {
    expect(
      shouldStopBeforeRun({ spentInUsd: 19.7, nextRunEstimateInUsd: 0.2, limitInUsd: 20 }),
    ).toBe(false);
  });
});

describe("spendLimitStopMessage", () => {
  it("says what was spent, the limit, and how far the bench got", () => {
    expect(
      spendLimitStopMessage({
        spentInUsd: 19.95,
        limitInUsd: 20,
        finishedRunCount: 212,
        plannedRunCount: 360,
      }),
    ).toBe(
      "krino-bench: stopped at the spend limit: spent $19.95 of --max-spend-usd $20.00 after " +
        "212 of 360 runs. The results cover the finished runs only.",
    );
  });
});
