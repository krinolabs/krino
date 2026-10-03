import { BENCH_TASKS, estimateCatalogSize } from "@krinolabs/bench";
import { selectLogTriageTools } from "@krinolabs/example-ai-sdk-cli/agent";
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
  type RunRecord,
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

export type BenchOutcome = { outcomeKind: "completed"; result: BenchResult };

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

  const observations: Array<RunObservation> = [];
  let spentInUsd = 0;
  for (const plannedRun of runPlan) {
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
  const setups = [];
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
    estimatedInUsd: 0,
    limitInUsd: benchRequest.maxSpendInUsd,
    spentInUsd,
    plannedRunCount: runPlan.length,
    finishedRunCount: observations.length,
    stopReason: null,
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
    setups,
    runs: observations.map(toRunRecord),
  };
  return { outcomeKind: "completed", result };
}
