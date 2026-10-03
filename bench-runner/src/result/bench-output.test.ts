import { mkdtempSync } from "node:fs";
import nodePath from "node:path";
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
    ]) {
      expect(benchText).toContain(columnName);
    }
  });
});
