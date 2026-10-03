import { mkdtempSync } from "node:fs";
import nodePath from "node:path";
import { KRINO_CONFIG_DEFAULTS } from "@krinolabs/krino";
import { beforeAll, describe, expect, it } from "vitest";
import { createFakeAgentEnvironment } from "../environment/agent-environment.js";
import { runBench } from "../run-bench.js";
import { type BenchResult, CHART_ROW_FIELDS, SIMULATED_NOTICE } from "./bench-result.js";
import { renderBenchText } from "./render-bench-text.js";

// AC3: every output carries what the blog chart needs, and fake output never looks real.

function freshTraceDirectory(): string {
  const isolatedDirectory = process.env.KRINO_TRACE_DIRECTORY;
  if (isolatedDirectory === undefined) {
    throw new Error("trace-isolation.ts must set KRINO_TRACE_DIRECTORY");
  }
  return mkdtempSync(nodePath.join(isolatedDirectory, "output-"));
}

let benchResult: BenchResult;

beforeAll(async () => {
  const outcome = await runBench(
    {
      setupNames: ["baseline", "per-step", "step-zero"],
      runSelection: { selectionKind: "pilot" },
      toolCounts: [10, 100],
      maxSpendInUsd: 20,
      decisionTimeoutInMilliseconds: KRINO_CONFIG_DEFAULTS.decisionTimeoutInMilliseconds,
      traceDirectory: freshTraceDirectory(),
    },
    { agentEnvironment: createFakeAgentEnvironment() },
  );
  if (outcome.outcomeKind !== "completed") {
    throw new Error(`bench did not complete: ${outcome.outcomeKind}`);
  }
  benchResult = outcome.result;
}, 120_000);

describe("bench result JSON", () => {
  it("is marked fake", () => {
    expect(benchResult.mode).toBe("fake");
    expect(benchResult.simulatedNotice).toBe(SIMULATED_NOTICE);
  });

  it("records the decision timeout the bench ran with", () => {
    expect(benchResult.options.decisionTimeoutInMilliseconds).toBe(800);
  });

  it("records model IDs, SDK versions, run date, tool loading and catalog size", () => {
    expect(benchResult.runDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(benchResult.models.configuredAgentModelIdentifier).toBe("claude-haiku-4-5");
    expect(benchResult.models.agentModelIdentifiers).toEqual(["claude-haiku-4-5"]);
    expect(benchResult.models.decisionModelVersions).toEqual(["fake-decision-model-1"]);
    expect(Object.keys(benchResult.sdkVersions).sort()).toEqual(
      [
        "@krinolabs/bench",
        "@krinolabs/bench-runner",
        "@krinolabs/cli",
        "@krinolabs/krino",
        "ai",
        "node",
      ].sort(),
    );
    expect(Object.hasOwn(benchResult.toolLoading, "mcpServerLoadedAllTools")).toBe(true);
    expect(benchResult.toolLoading.mcpServerLoadedAllTools).toBeNull();
    expect(benchResult.catalog.fullCatalogTokenCount).toBeGreaterThan(15_000);
    expect(benchResult.catalog.byToolCount.map((sizeRecord) => sizeRecord.toolCount)).toEqual([
      10, 100,
    ]);
  });

  it("has one chart row per setup and tool count, with every chart field", () => {
    expect(
      benchResult.chartRows.map((chartRow) => `${chartRow.setupName}/${chartRow.toolCount}`),
    ).toEqual([
      "baseline/10",
      "baseline/100",
      "per-step/10",
      "per-step/100",
      "step-zero/10",
      "step-zero/100",
    ]);
    for (const chartRow of benchResult.chartRows) {
      for (const fieldName of CHART_ROW_FIELDS) {
        expect(Object.hasOwn(chartRow, fieldName), `${chartRow.setupName} ${fieldName}`).toBe(true);
      }
      expect(chartRow.selectionRecall).toBe(1);
      expect(chartRow.costPerStepInUsd).toBeGreaterThan(0);
      expect(chartRow.cacheReadShare).not.toBeNull();
      expect(chartRow.multiStepCacheReadShare).not.toBeNull();
      // baseline asks no tool selection; the fake provider answers well inside 800 ms.
      expect(chartRow.toolSelectionTimeoutShare).toBe(chartRow.setupName === "baseline" ? null : 0);
    }
  });

  it("shows the cache trap: per-step reads less cache than step-zero on multi-step runs", () => {
    const rowFor = (setupName: string) =>
      benchResult.chartRows.find(
        (chartRow) => chartRow.setupName === setupName && chartRow.toolCount === 100,
      );
    expect(rowFor("per-step")?.multiStepCacheReadShare ?? 1).toBeLessThan(
      rowFor("step-zero")?.multiStepCacheReadShare ?? 0,
    );
    expect(rowFor("step-zero")?.meanKeptShare ?? 1).toBeLessThan(
      rowFor("baseline")?.meanKeptShare ?? 0,
    );
  });

  it("reports every setup per difficulty and per stable task id", () => {
    for (const setupResult of benchResult.setups) {
      expect(Object.keys(setupResult.byDifficulty)).toEqual(["easy", "lookAlike", "multiStep"]);
      const taskIdentifiers = setupResult.byTask.map((taskMetrics) => taskMetrics.taskIdentifier);
      expect(taskIdentifiers).toEqual([...taskIdentifiers].sort());
      expect(taskIdentifiers).toHaveLength(10);
      for (const taskMetrics of setupResult.byTask) {
        expect(taskMetrics.sequenceMatch === null).toBe(taskMetrics.difficulty !== "multiStep");
      }
    }
    expect(
      benchResult.runs.every((runRecord) => runRecord.taskIdentifier.startsWith("task-")),
    ).toBe(true);
  });
});

describe("bench result text", () => {
  it("starts with the simulated notice in fake mode", () => {
    expect(renderBenchText(benchResult).split("\n")[0]).toBe(SIMULATED_NOTICE);
  });

  it("does not show the notice for live results", () => {
    const liveText = renderBenchText({ ...benchResult, mode: "live", simulatedNotice: null });
    expect(liveText).not.toContain("SIMULATED");
    expect(liveText.split("\n")[0]).toContain("mode: live");
  });

  it("records model IDs, SDK versions, run date, tool loading and catalog size", () => {
    const benchText = renderBenchText(benchResult);
    expect(benchText).toContain(benchResult.runDate);
    expect(benchText).toContain("claude-haiku-4-5");
    expect(benchText).toContain("fake-decision-model-1");
    expect(benchText).toContain(`ai ${benchResult.sdkVersions.ai}`);
    expect(benchText).toContain("no MCP server");
    expect(benchText).toContain(benchResult.catalog.fullCatalogTokenCount.toLocaleString("en-US"));
  });

  it("shows each comparison column", () => {
    const benchText = renderBenchText(benchResult);
    for (const columnName of [
      "recall",
      "step-0 recall",
      "kept",
      "seq match",
      "extra calls",
      "cost/step",
      "cache read (all/multi)",
      "step p50",
      "decision cost",
      "confident",
      "timed out",
    ]) {
      expect(benchText).toContain(columnName);
    }
  });
});

describe("bench output with a slow decision provider", () => {
  it("shows the timeout rate: every selection timed out and failed open", async () => {
    const outcome = await runBench(
      {
        setupNames: ["step-zero"],
        runSelection: { selectionKind: "pilot" },
        toolCounts: [10],
        maxSpendInUsd: 20,
        decisionTimeoutInMilliseconds: 50,
        traceDirectory: freshTraceDirectory(),
      },
      { agentEnvironment: createFakeAgentEnvironment({ decisionLatencyInMilliseconds: 300 }) },
    );
    if (outcome.outcomeKind !== "completed") {
      throw new Error(`bench did not complete: ${outcome.outcomeKind}`);
    }
    const slowResult = outcome.result;
    expect(slowResult.options.decisionTimeoutInMilliseconds).toBe(50);
    expect(slowResult.chartRows[0]).toMatchObject({
      setupName: "step-zero",
      toolSelectionTimeoutShare: 1,
      // Fail open: all tools, so recall holds and nothing is pruned.
      selectionRecall: 1,
      meanKeptShare: 1,
    });
    expect(slowResult.setups[0]?.overall.decisions.timedOutSelectionShare).toBe(1);
    // "timed out" is the last column of the comparison table.
    const comparisonLine = renderBenchText(slowResult)
      .split("\n")
      .find((line) => line.startsWith("step-zero"));
    expect(comparisonLine?.endsWith("100.0%")).toBe(true);
  }, 120_000);
});
