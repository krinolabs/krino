import { BENCH_TASKS, estimateCatalogSize } from "@krinolabs/bench";
import { selectLogTriageTools } from "@krinolabs/example-ai-sdk-cli/agent";
import { DEFAULT_MODEL_PRICES, findModelPrice, type ModelPrice } from "@krinolabs/krino";
import type { AgentEnvironment } from "./environment/agent-environment.js";
import { readSdkVersions, type SdkVersions } from "./environment/installed-versions.js";
import {
  type BenchSetupName,
  buildRunPlan,
  type PlannedRun,
  type RunSelection,
} from "./plan/run-plan.js";
import {
  readSetupReport,
  type SetupReportRequest,
  type SetupReportResult,
} from "./report/report-engine.js";
import {
  AI_SDK_TOOL_LOADING,
  BENCH_RESULT_SCHEMA_VERSION,
  type BenchResult,
  type CatalogSizeRecord,
  type ChartRow,
  type RunRecord,
  type SetupResult,
  SIMULATED_NOTICE,
  type SpendRecord,
} from "./result/bench-result.js";
import { groupObservations } from "./scoring/aggregate-metrics.js";
import { scoreRecallAtNeededStep, scoreStepZeroRecall } from "./scoring/scoring.js";
import {
  type RunBenchTaskInputs,
  type RunObservation,
  runBenchTask,
} from "./setups/run-bench-task.js";
import { estimateRunCostInUsd } from "./spend/spend-estimate.js";
import { checkEstimate, shouldStopBeforeRun, spendLimitStopMessage } from "./spend/spend-guard.js";

// Runs the plan one run at a time, then scores it and reads each setup's report.

export type BenchRequest = {
  setupNames: Array<BenchSetupName>;
  runSelection: RunSelection;
  toolCounts: Array<PlannedRun["toolCount"]>;
  maxSpendInUsd: number;
  /** Absolute. Every setup writes here, under its own project name. */
  traceDirectory: string;
};

export type BenchDependencies = {
  agentEnvironment: AgentEnvironment;
  executeRun?: (runInputs: RunBenchTaskInputs) => Promise<RunObservation>;
  readReport?: (reportRequest: SetupReportRequest) => Promise<SetupReportResult>;
  now?: () => Date;
  sdkVersions?: () => SdkVersions;
  /** One line per finished run (stderr in the bin). */
  reportProgress?: (progressLine: string) => void;
};

export type BenchOutcome =
  | { outcomeKind: "completed"; result: BenchResult }
  | { outcomeKind: "stoppedAtSpendLimit"; result: BenchResult; message: string }
  | { outcomeKind: "refusedOverEstimate"; estimatedInUsd: number; message: string };

/** Each planned run's estimate, priced with the environment's prices (overrides first). */
function estimatePlan(
  runPlan: ReadonlyArray<PlannedRun>,
  agentEnvironment: AgentEnvironment,
): Array<number> {
  const modelPrices: Array<ModelPrice> = [
    ...agentEnvironment.priceOverrides,
    ...DEFAULT_MODEL_PRICES,
  ];
  const agentModelPrice = findModelPrice(agentEnvironment.agentModelIdentifier, modelPrices);
  const decisionModelPrice = findModelPrice(agentEnvironment.decisionPriceIdentifier, modelPrices);
  return runPlan.map((plannedRun) =>
    estimateRunCostInUsd({
      setupName: plannedRun.setupName,
      toolCount: plannedRun.toolCount,
      task: plannedRun.task,
      agentModelPrice,
      decisionModelPrice,
    }),
  );
}

function totalOf(amounts: ReadonlyArray<number>): number {
  return amounts.reduce((total, amount) => total + amount, 0);
}

function catalogSizeRecord(runPlan: ReadonlyArray<PlannedRun>): CatalogSizeRecord {
  const tokenCountsByToolCount = new Map<number, Array<number>>();
  const measuredKeys = new Set<string>();
  for (const plannedRun of runPlan) {
    const measureKey = `${plannedRun.toolCount}/${plannedRun.task.taskIdentifier}`;
    if (measuredKeys.has(measureKey)) {
      continue;
    }
    measuredKeys.add(measureKey);
    const tokenCount = estimateCatalogSize(
      selectLogTriageTools(plannedRun.toolCount, plannedRun.task.expectedToolNames),
    ).estimatedTokenCount;
    const tokenCounts = tokenCountsByToolCount.get(plannedRun.toolCount) ?? [];
    tokenCounts.push(tokenCount);
    tokenCountsByToolCount.set(plannedRun.toolCount, tokenCounts);
  }
  return {
    fullCatalogTokenCount: estimateCatalogSize().estimatedTokenCount,
    byToolCount: [...tokenCountsByToolCount.entries()]
      .sort(([leftCount], [rightCount]) => leftCount - rightCount)
      .map(([toolCount, tokenCounts]) => ({
        toolCount,
        minTokenCount: Math.min(...tokenCounts),
        meanTokenCount: Math.round(
          tokenCounts.reduce((total, tokenCount) => total + tokenCount, 0) / tokenCounts.length,
        ),
        maxTokenCount: Math.max(...tokenCounts),
      })),
  };
}

function toChartRow(
  setupResult: SetupResult,
  observations: ReadonlyArray<RunObservation>,
): ChartRow {
  const metrics = setupResult.overall;
  const reportSummary =
    setupResult.reportEngine.reportKind === "read" ? setupResult.reportEngine.summary : null;
  const catalogTokenCounts = observations
    .filter((observation) => observation.projectName === setupResult.projectName)
    .map((observation) => observation.catalogTokenCount);
  return {
    setupName: setupResult.setupName,
    toolCount: setupResult.toolCount,
    runCount: metrics.runCount,
    failedRunCount: metrics.failedRunCount,
    selectionRecall: metrics.selectionRecall,
    stepZeroSelectionRecall: metrics.stepZeroSelectionRecall,
    meanKeptShare: metrics.setSize.meanKeptShare,
    medianKeptShare: metrics.setSize.medianKeptShare,
    meanKeptCount: metrics.setSize.meanKeptCount,
    sequenceMatch: metrics.multiStep.sequenceMatch,
    meanExtraCallCount: metrics.multiStep.meanExtraCallCount,
    costPerStepInUsd: metrics.costPerStep?.meanCostInUsd ?? null,
    meanUncachedInputTokensPerStep: metrics.costPerStep?.meanUncachedInputTokens ?? null,
    meanCacheReadTokensPerStep: metrics.costPerStep?.meanCacheReadTokens ?? null,
    meanCacheWriteTokensPerStep: metrics.costPerStep?.meanCacheWriteTokens ?? null,
    costPerRunInUsd: metrics.costPerRunInUsd,
    cacheReadShare: reportSummary?.cacheReadShare ?? null,
    multiStepCacheReadShare: reportSummary?.multiStepCacheReadShare ?? null,
    stepLatencyP50InMilliseconds: metrics.stepLatencyInMilliseconds.p50,
    stepLatencyP95InMilliseconds: metrics.stepLatencyInMilliseconds.p95,
    decisionLatencyP50InMilliseconds: metrics.decisions.decisionLatencyInMilliseconds.p50,
    decisionLatencyP95InMilliseconds: metrics.decisions.decisionLatencyInMilliseconds.p95,
    decisionCostPerRunInUsd: metrics.decisions.decisionCostPerRunInUsd,
    confidentSelectionShare: metrics.decisions.confidentSelectionShare,
    meanCatalogTokenCount:
      catalogTokenCounts.length === 0
        ? null
        : totalOf(catalogTokenCounts) / catalogTokenCounts.length,
  };
}

function toRunRecord(observation: RunObservation): RunRecord {
  return {
    runIndex: observation.runIndex,
    setupName: observation.setupName,
    toolCount: observation.toolCount,
    taskIdentifier: observation.taskIdentifier,
    repeatIndex: observation.repeatIndex,
    runStatus: observation.runStatus,
    failureText: observation.failureText,
    stepCount: observation.steps.length,
    offeredToolCountByStep: observation.steps.map(
      (observedStep) => new Set(observedStep.offeredToolNames).size,
    ),
    calledToolNames: [...observation.calledToolNames],
    selectionRecall: scoreRecallAtNeededStep(observation.expectedToolNames, observation.steps),
    stepZeroSelectionRecall: scoreStepZeroRecall(observation.expectedToolNames, observation.steps),
    catalogTokenCount: observation.catalogTokenCount,
    agentCostInUsd: observation.agentCostInUsd,
    decisionCostInUsd: observation.decisionCostInUsd,
  };
}

function distinctSorted(values: ReadonlyArray<string | null>): Array<string> {
  return [...new Set(values.flatMap((value) => (value === null ? [] : [value])))].sort();
}

function formatProgress(
  observation: RunObservation,
  finishedCount: number,
  plannedCount: number,
): string {
  const countWidth = String(plannedCount).length;
  const recallMark = scoreRecallAtNeededStep(observation.expectedToolNames, observation.steps)
    ? "recall ok"
    : "recall miss";
  const statusText = observation.runStatus === "completed" ? recallMark : "FAILED";
  return (
    `[${String(finishedCount).padStart(countWidth)}/${plannedCount}] ` +
    `${observation.setupName} · ${observation.toolCount} tools · ${observation.taskIdentifier} · ` +
    `${statusText} · $${observation.spentInUsd.toFixed(4)}`
  );
}

export async function runBench(
  benchRequest: BenchRequest,
  dependencies: BenchDependencies,
): Promise<BenchOutcome> {
  const { agentEnvironment } = dependencies;
  const executeRun = dependencies.executeRun ?? runBenchTask;
  const readReport = dependencies.readReport ?? readSetupReport;
  const now = dependencies.now ?? (() => new Date());
  const startedAt = now();
  const runPlan = buildRunPlan({
    setupNames: benchRequest.setupNames,
    toolCounts: benchRequest.toolCounts,
    runSelection: benchRequest.runSelection,
    tasks: BENCH_TASKS,
  });
  const runEstimates = estimatePlan(runPlan, agentEnvironment);
  const estimatedInUsd = totalOf(runEstimates);
  const estimateCheck = checkEstimate({
    estimatedInUsd,
    limitInUsd: benchRequest.maxSpendInUsd,
    pilotEstimateInUsd:
      benchRequest.runSelection.selectionKind === "pilot"
        ? null
        : totalOf(
            estimatePlan(
              buildRunPlan({
                setupNames: benchRequest.setupNames,
                toolCounts: benchRequest.toolCounts,
                runSelection: { selectionKind: "pilot" },
                tasks: BENCH_TASKS,
              }),
              agentEnvironment,
            ),
          ),
  });
  if (!estimateCheck.withinLimit) {
    return { outcomeKind: "refusedOverEstimate", estimatedInUsd, message: estimateCheck.message };
  }
  dependencies.reportProgress?.(
    `krino-bench: estimated cost $${estimatedInUsd.toFixed(2)} of --max-spend-usd ` +
      `$${benchRequest.maxSpendInUsd.toFixed(2)}; ${runPlan.length} runs planned.`,
  );

  const observations: Array<RunObservation> = [];
  let spentInUsd = 0;
  let stoppedAtSpendLimit = false;
  for (const plannedRun of runPlan) {
    if (
      shouldStopBeforeRun({
        spentInUsd,
        nextRunEstimateInUsd: runEstimates[plannedRun.runIndex] ?? 0,
        limitInUsd: benchRequest.maxSpendInUsd,
      })
    ) {
      stoppedAtSpendLimit = true;
      break;
    }
    const observation = await executeRun({
      plannedRun,
      traceDirectory: benchRequest.traceDirectory,
      agentEnvironment,
    });
    observations.push(observation);
    spentInUsd += observation.spentInUsd;
    dependencies.reportProgress?.(formatProgress(observation, observations.length, runPlan.length));
  }

  const setupGroups = groupObservations(observations);
  const setups: Array<SetupResult> = [];
  for (const setupGroup of setupGroups) {
    setups.push({
      ...setupGroup,
      reportEngine: await readReport({
        projectName: setupGroup.projectName,
        since: startedAt,
        traceDirectory: benchRequest.traceDirectory,
      }),
    });
  }
  const spend: SpendRecord = {
    estimatedInUsd,
    limitInUsd: benchRequest.maxSpendInUsd,
    spentInUsd,
    plannedRunCount: runPlan.length,
    finishedRunCount: observations.length,
    stopReason: stoppedAtSpendLimit ? "spendLimit" : null,
  };
  const result: BenchResult = {
    benchResultSchemaVersion: BENCH_RESULT_SCHEMA_VERSION,
    mode: agentEnvironment.mode,
    simulatedNotice: agentEnvironment.mode === "fake" ? SIMULATED_NOTICE : null,
    runDate: startedAt.toISOString().slice(0, 10),
    startedAt: startedAt.toISOString(),
    finishedAt: now().toISOString(),
    options: {
      setupNames: [...benchRequest.setupNames],
      runSelection: benchRequest.runSelection,
      toolCounts: [...benchRequest.toolCounts],
      maxSpendInUsd: benchRequest.maxSpendInUsd,
    },
    models: {
      configuredAgentModelIdentifier: agentEnvironment.agentModelIdentifier,
      agentModelIdentifiers: distinctSorted(
        observations.flatMap((observation) => observation.agentModelIdentifiers),
      ),
      decisionProviderName: agentEnvironment.decisionProviderName,
      decisionModelVersions: distinctSorted(
        observations.flatMap((observation) =>
          [...observation.toolSelectionDecisions, ...observation.riskGateDecisions].map(
            (decisionRecord) => decisionRecord.decisionModelVersion,
          ),
        ),
      ),
    },
    sdkVersions: (dependencies.sdkVersions ?? readSdkVersions)(),
    toolLoading: AI_SDK_TOOL_LOADING,
    catalog: catalogSizeRecord(runPlan),
    spend,
    traceDirectory: benchRequest.traceDirectory,
    chartRows: setups.map((setupResult) => toChartRow(setupResult, observations)),
    setups,
    runs: observations.map(toRunRecord),
  };
  if (stoppedAtSpendLimit) {
    return {
      outcomeKind: "stoppedAtSpendLimit",
      result,
      message: spendLimitStopMessage({
        spentInUsd,
        limitInUsd: benchRequest.maxSpendInUsd,
        finishedRunCount: observations.length,
        plannedRunCount: runPlan.length,
      }),
    };
  }
  return { outcomeKind: "completed", result };
}
