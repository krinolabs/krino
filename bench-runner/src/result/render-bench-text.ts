import { DIFFICULTY_ORDER } from "../plan/run-plan.js";
import type { BenchMetrics } from "../scoring/aggregate-metrics.js";
import type { BenchResult, SetupResult } from "./bench-result.js";

// The comparison as plain text. Fake output starts with SIMULATED_NOTICE on its first line.

function percentText(share: number | null): string {
  return share === null ? "—" : `${(share * 100).toFixed(1)}%`;
}

function numberText(value: number | null, fractionDigits = 1): string {
  return value === null ? "—" : value.toFixed(fractionDigits);
}

function usdText(value: number | null): string {
  return value === null ? "—" : `$${value.toFixed(value !== 0 && Math.abs(value) < 0.01 ? 5 : 4)}`;
}

function millisecondsText(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)} ms`;
}

function tokenText(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

/** Left-aligned columns, two spaces apart. */
function renderTable(rows: ReadonlyArray<ReadonlyArray<string>>): Array<string> {
  const columnWidths: Array<number> = [];
  for (const row of rows) {
    row.forEach((cellText, columnIndex) => {
      columnWidths[columnIndex] = Math.max(columnWidths[columnIndex] ?? 0, cellText.length);
    });
  }
  return rows.map((row) =>
    row
      .map((cellText, columnIndex) =>
        columnIndex === row.length - 1 ? cellText : cellText.padEnd(columnWidths[columnIndex] ?? 0),
      )
      .join("  ")
      .trimEnd(),
  );
}

function cacheShareText(setupResult: SetupResult, multiStepOnly: boolean): string {
  if (setupResult.reportEngine.reportKind !== "read") {
    return "n/a";
  }
  const { summary } = setupResult.reportEngine;
  return percentText(multiStepOnly ? summary.multiStepCacheReadShare : summary.cacheReadShare);
}

function comparisonRows(setupResults: ReadonlyArray<SetupResult>): Array<Array<string>> {
  const headerRow = [
    "setup",
    "runs",
    "recall",
    "step-0 recall",
    "kept (mean/median)",
    "seq match",
    "extra calls",
    "cost/step",
    "tokens/step uncached·read·write",
    "cache read (all/multi)",
    "step p50",
    "decision p50",
    "decision cost",
    "confident",
  ];
  const dataRows = setupResults.map((setupResult) => {
    const metrics: BenchMetrics = setupResult.overall;
    const costPerStep = metrics.costPerStep;
    return [
      setupResult.setupName,
      metrics.failedRunCount === 0
        ? String(metrics.runCount)
        : `${metrics.runCount} (${metrics.failedRunCount} failed)`,
      percentText(metrics.selectionRecall),
      percentText(metrics.stepZeroSelectionRecall),
      `${percentText(metrics.setSize.meanKeptShare)} / ${percentText(metrics.setSize.medianKeptShare)}`,
      percentText(metrics.multiStep.sequenceMatch),
      numberText(metrics.multiStep.meanExtraCallCount, 2),
      usdText(costPerStep?.meanCostInUsd ?? null),
      costPerStep === null
        ? "—"
        : `${tokenText(costPerStep.meanUncachedInputTokens)}·${tokenText(costPerStep.meanCacheReadTokens)}·${tokenText(costPerStep.meanCacheWriteTokens)}`,
      `${cacheShareText(setupResult, false)} / ${cacheShareText(setupResult, true)}`,
      millisecondsText(metrics.stepLatencyInMilliseconds.p50),
      millisecondsText(metrics.decisions.decisionLatencyInMilliseconds.p50),
      usdText(metrics.decisions.decisionCostInUsd),
      percentText(metrics.decisions.confidentSelectionShare),
    ];
  });
  return [headerRow, ...dataRows];
}

function difficultyRows(setupResults: ReadonlyArray<SetupResult>): Array<Array<string>> {
  return [
    ["setup", "tools", ...DIFFICULTY_ORDER.map((difficulty) => `${difficulty} recall`)],
    ...setupResults.map((setupResult) => [
      setupResult.setupName,
      String(setupResult.toolCount),
      ...DIFFICULTY_ORDER.map((difficulty) =>
        percentText(setupResult.byDifficulty[difficulty].selectionRecall),
      ),
    ]),
  ];
}

function taskRows(setupResults: ReadonlyArray<SetupResult>): Array<Array<string>> {
  const taskIdentifiers = [
    ...new Set(
      setupResults.flatMap((setupResult) =>
        setupResult.byTask.map((taskMetrics) => taskMetrics.taskIdentifier),
      ),
    ),
  ].sort();
  const metricsBySetup = setupResults.map(
    (setupResult) =>
      new Map(setupResult.byTask.map((taskMetrics) => [taskMetrics.taskIdentifier, taskMetrics])),
  );
  const difficultyByTask = new Map(
    setupResults.flatMap((setupResult) =>
      setupResult.byTask.map((taskMetrics) => [taskMetrics.taskIdentifier, taskMetrics.difficulty]),
    ),
  );
  return [
    [
      "task",
      "difficulty",
      ...setupResults.map((setupResult) => `${setupResult.setupName}/${setupResult.toolCount}`),
    ],
    ...taskIdentifiers.map((taskIdentifier) => [
      taskIdentifier,
      difficultyByTask.get(taskIdentifier) ?? "",
      ...metricsBySetup.map((taskMetricsById) => {
        const taskMetrics = taskMetricsById.get(taskIdentifier);
        if (taskMetrics === undefined) {
          return "—";
        }
        const sequenceText =
          taskMetrics.sequenceMatch === null
            ? ""
            : ` seq ${percentText(taskMetrics.sequenceMatch)} +${numberText(taskMetrics.meanExtraCallCount, 1)}`;
        return `${percentText(taskMetrics.selectionRecall)}${sequenceText}`;
      }),
    ]),
  ];
}

function modeText(benchResult: BenchResult): string {
  return benchResult.mode === "fake"
    ? "fake (AI SDK mock model + krino fake decision provider; no API calls)"
    : "live (Vercel AI Gateway; Jev decisions)";
}

export function renderBenchText(benchResult: BenchResult): string {
  const lines: Array<string> = [];
  if (benchResult.simulatedNotice !== null) {
    lines.push(benchResult.simulatedNotice);
  }
  const { models, sdkVersions, spend, catalog } = benchResult;
  lines.push(`krino-bench · ${benchResult.runDate} · mode: ${modeText(benchResult)}`);
  lines.push(
    `Agent model: ${models.configuredAgentModelIdentifier} (traced: ${models.agentModelIdentifiers.join(", ") || "none"}) · ` +
      `decisions: ${models.decisionProviderName} (${models.decisionModelVersions.join(", ") || "none"})`,
  );
  lines.push(
    `SDKs: ${Object.entries(sdkVersions)
      .map(([packageName, version]) => `${packageName} ${version}`)
      .join(" · ")}`,
  );
  const mcpText =
    benchResult.toolLoading.mcpServerLoadedAllTools === null
      ? "no MCP server"
      : `MCP server loaded all tools: ${benchResult.toolLoading.mcpServerLoadedAllTools ? "yes" : "no"}`;
  lines.push(
    `Tool loading: ${benchResult.toolLoading.hostName} host, ${mcpText}, deferred loading ${benchResult.toolLoading.deferredToolLoading ? "on" : "off"}`,
  );
  lines.push(
    `Catalog tokens (characters ÷ 4): full 100-tool catalog ≈ ${tokenText(catalog.fullCatalogTokenCount)}` +
      catalog.byToolCount
        .filter((sizeRecord) => sizeRecord.toolCount !== 100)
        .map(
          (sizeRecord) =>
            ` · ${sizeRecord.toolCount} tools ≈ ${tokenText(sizeRecord.meanTokenCount)} (${tokenText(sizeRecord.minTokenCount)}–${tokenText(sizeRecord.maxTokenCount)} by task)`,
        )
        .join(""),
  );
  lines.push(
    `Runs: ${spend.finishedRunCount} of ${spend.plannedRunCount} · spent ${usdText(spend.spentInUsd)} of ` +
      `${usdText(spend.limitInUsd)} (estimated ${usdText(spend.estimatedInUsd)})` +
      (spend.stopReason === "spendLimit" ? " · STOPPED AT THE SPEND LIMIT" : ""),
  );
  lines.push(`Traces: ${benchResult.traceDirectory}`);

  const toolCounts = [...new Set(benchResult.setups.map((setupResult) => setupResult.toolCount))];
  for (const toolCount of toolCounts) {
    const setupResults = benchResult.setups.filter(
      (setupResult) => setupResult.toolCount === toolCount,
    );
    lines.push("", `${toolCount} tools`, ...renderTable(comparisonRows(setupResults)));
  }
  lines.push(
    "",
    "Selection recall by difficulty",
    ...renderTable(difficultyRows(benchResult.setups)),
  );
  lines.push(
    "",
    "Per task (recall at the needed step; multiStep: sequence match and mean extra calls)",
    ...renderTable(taskRows(benchResult.setups)),
  );
  const unavailableReports = benchResult.setups.flatMap((setupResult) =>
    setupResult.reportEngine.reportKind === "unavailable"
      ? [`${setupResult.projectName}: ${setupResult.reportEngine.reason}`]
      : [],
  );
  if (unavailableReports.length > 0) {
    lines.push("", "Report engine unavailable for:", ...unavailableReports);
  }
  return `${lines.join("\n")}\n`;
}
