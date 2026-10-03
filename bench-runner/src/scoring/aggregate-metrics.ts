import type { BenchTaskDifficulty } from "@krinolabs/bench";
import { type DecisionRecord, KRINO_CONFIG_DEFAULTS } from "@krinolabs/krino";
import { BENCH_SETUP_NAMES, type BenchSetupName } from "../plan/run-plan.js";
import type { RunObservation } from "../setups/run-bench-task.js";
import {
  matchExpectedSequence,
  measureKeptShare,
  scoreRecallAtNeededStep,
  scoreStepZeroRecall,
} from "./scoring.js";

// Bench metrics over a set of runs. Pure. Failed runs are counted but not scored. A rate with
// nothing to score is `null`, never 0.

export type LatencyPercentiles = { p50: number | null; p95: number | null };

export type BenchMetrics = {
  runCount: number;
  failedRunCount: number;
  stepCount: number;
  /** Primary: every expected tool was offered on the step it was needed. */
  selectionRecall: number | null;
  /** Secondary: every expected tool was in the step-0 set. */
  stepZeroSelectionRecall: number | null;
  setSize: {
    meanKeptShare: number | null;
    medianKeptShare: number | null;
    meanKeptCount: number | null;
    meanAvailableToolCount: number | null;
  };
  /** multiStep runs only. */
  multiStep: {
    runCount: number;
    sequenceMatch: number | null;
    meanExtraCallCount: number | null;
  };
  /** Main-model cost per step, with the cache split; `null` without steps. */
  costPerStep: {
    meanCostInUsd: number;
    meanUncachedInputTokens: number;
    meanCacheReadTokens: number;
    meanCacheWriteTokens: number;
    meanOutputTokens: number;
  } | null;
  costPerRunInUsd: number | null;
  stepLatencyInMilliseconds: LatencyPercentiles;
  decisions: {
    /** Tool selections asked (step-zero: one per run; per-step: one per step). */
    toolSelectionCount: number;
    /** Selections where every answer was confident (the weakest probability ≥ minimum). */
    confidentSelectionShare: number | null;
    /** Selections that timed out (`decisionStatus: "timedOut"`) and so failed open: all tools. */
    timedOutSelectionShare: number | null;
    /** Tool selection and risk gate, estimated by the runtime. */
    decisionCostInUsd: number;
    decisionCostPerRunInUsd: number | null;
    decisionLatencyInMilliseconds: LatencyPercentiles;
  };
};

export type TaskMetrics = {
  taskIdentifier: string;
  difficulty: BenchTaskDifficulty;
  expectedToolNames: Array<string>;
  runCount: number;
  failedRunCount: number;
  selectionRecall: number | null;
  stepZeroSelectionRecall: number | null;
  meanKeptShare: number | null;
  /** multiStep tasks only; `null` for the others. */
  sequenceMatch: number | null;
  meanExtraCallCount: number | null;
};

export type SetupGroupMetrics = {
  setupName: BenchSetupName;
  toolCount: number;
  projectName: string;
  overall: BenchMetrics;
  byDifficulty: Record<BenchTaskDifficulty, BenchMetrics>;
  /** Sorted by task id. */
  byTask: Array<TaskMetrics>;
};

function meanOf(values: ReadonlyArray<number>): number | null {
  return values.length === 0
    ? null
    : values.reduce((total, value) => total + value, 0) / values.length;
}

function medianOf(values: ReadonlyArray<number>): number | null {
  if (values.length === 0) {
    return null;
  }
  const sortedValues = [...values].sort((left, right) => left - right);
  const middleIndex = Math.floor(sortedValues.length / 2);
  const upperMiddle = sortedValues[middleIndex] ?? 0;
  return sortedValues.length % 2 === 1
    ? upperMiddle
    : ((sortedValues[middleIndex - 1] ?? 0) + upperMiddle) / 2;
}

function shareOf(flags: ReadonlyArray<boolean>): number | null {
  return flags.length === 0 ? null : flags.filter(Boolean).length / flags.length;
}

/** Nearest-rank percentile; `null` without values. */
export function percentile(values: ReadonlyArray<number>, rank: number): number | null {
  if (values.length === 0) {
    return null;
  }
  const sortedValues = [...values].sort((left, right) => left - right);
  const rankIndex = Math.max(0, Math.ceil(rank * sortedValues.length) - 1);
  return sortedValues[Math.min(rankIndex, sortedValues.length - 1)] ?? null;
}

function latencyPercentiles(values: ReadonlyArray<number>): LatencyPercentiles {
  return { p50: percentile(values, 0.5), p95: percentile(values, 0.95) };
}

function numbersOnly(values: ReadonlyArray<number | null>): Array<number> {
  return values.flatMap((value) => (value === null ? [] : [value]));
}

function isConfident(decisionRecord: DecisionRecord): boolean {
  return (
    decisionRecord.decisionStatus === "answered" &&
    decisionRecord.probability !== null &&
    decisionRecord.probability >= KRINO_CONFIG_DEFAULTS.minimumConfidence
  );
}

export function aggregateMetrics(observations: ReadonlyArray<RunObservation>): BenchMetrics {
  const scoredRuns = observations.filter((observation) => observation.runStatus === "completed");
  const allSteps = scoredRuns.flatMap((observation) => observation.steps);
  const keptShares = scoredRuns.map((observation) =>
    measureKeptShare(observation.steps, observation.availableToolCount),
  );
  const multiStepRuns = scoredRuns.filter((observation) => observation.difficulty === "multiStep");
  const sequenceMatches = multiStepRuns.map((observation) =>
    matchExpectedSequence(observation.expectedToolNames, observation.calledToolNames),
  );
  const toolSelectionDecisions = scoredRuns.flatMap(
    (observation) => observation.toolSelectionDecisions,
  );
  const allDecisions = [
    ...toolSelectionDecisions,
    ...scoredRuns.flatMap((observation) => observation.riskGateDecisions),
  ];
  const decisionCostInUsd = numbersOnly(
    allDecisions.map((decisionRecord) => decisionRecord.decisionCostInUsd),
  ).reduce((total, cost) => total + cost, 0);
  const tokenUsages = allSteps.flatMap((observedStep) =>
    observedStep.tokenUsage === null ? [] : [observedStep.tokenUsage],
  );
  const meanCostPerStep = meanOf(
    numbersOnly(allSteps.map((observedStep) => observedStep.costInUsd)),
  );

  return {
    runCount: observations.length,
    failedRunCount: observations.length - scoredRuns.length,
    stepCount: allSteps.length,
    selectionRecall: shareOf(
      scoredRuns.map((observation) =>
        scoreRecallAtNeededStep(observation.expectedToolNames, observation.steps),
      ),
    ),
    stepZeroSelectionRecall: shareOf(
      scoredRuns.map((observation) =>
        scoreStepZeroRecall(observation.expectedToolNames, observation.steps),
      ),
    ),
    setSize: {
      meanKeptShare: meanOf(keptShares.map((keptShare) => keptShare.keptShare)),
      medianKeptShare: medianOf(keptShares.map((keptShare) => keptShare.keptShare)),
      meanKeptCount: meanOf(keptShares.map((keptShare) => keptShare.keptCount)),
      meanAvailableToolCount: meanOf(
        scoredRuns.map((observation) => observation.availableToolCount),
      ),
    },
    multiStep: {
      runCount: multiStepRuns.length,
      sequenceMatch: shareOf(sequenceMatches.map((sequenceMatch) => sequenceMatch.isMatched)),
      meanExtraCallCount: meanOf(
        sequenceMatches.map((sequenceMatch) => sequenceMatch.extraCallCount),
      ),
    },
    costPerStep:
      meanCostPerStep === null
        ? null
        : {
            meanCostInUsd: meanCostPerStep,
            meanUncachedInputTokens: meanOf(tokenUsages.map((usage) => usage.inputTokens)) ?? 0,
            meanCacheReadTokens: meanOf(tokenUsages.map((usage) => usage.cacheReadTokens)) ?? 0,
            meanCacheWriteTokens: meanOf(tokenUsages.map((usage) => usage.cacheWriteTokens)) ?? 0,
            meanOutputTokens: meanOf(tokenUsages.map((usage) => usage.outputTokens)) ?? 0,
          },
    costPerRunInUsd: meanOf(scoredRuns.map((observation) => observation.agentCostInUsd)),
    stepLatencyInMilliseconds: latencyPercentiles(
      numbersOnly(allSteps.map((observedStep) => observedStep.latencyInMilliseconds)),
    ),
    decisions: {
      toolSelectionCount: toolSelectionDecisions.length,
      confidentSelectionShare: shareOf(toolSelectionDecisions.map(isConfident)),
      timedOutSelectionShare: shareOf(
        toolSelectionDecisions.map(
          (decisionRecord) => decisionRecord.decisionStatus === "timedOut",
        ),
      ),
      decisionCostInUsd,
      decisionCostPerRunInUsd:
        scoredRuns.length === 0 ? null : decisionCostInUsd / scoredRuns.length,
      decisionLatencyInMilliseconds: latencyPercentiles(
        numbersOnly(
          toolSelectionDecisions.map((decisionRecord) => decisionRecord.latencyInMilliseconds),
        ),
      ),
    },
  };
}

function aggregateTask(taskObservations: ReadonlyArray<RunObservation>): TaskMetrics | null {
  const firstObservation = taskObservations[0];
  if (firstObservation === undefined) {
    return null;
  }
  const metrics = aggregateMetrics(taskObservations);
  const isMultiStep = firstObservation.difficulty === "multiStep";
  return {
    taskIdentifier: firstObservation.taskIdentifier,
    difficulty: firstObservation.difficulty,
    expectedToolNames: [...firstObservation.expectedToolNames],
    runCount: metrics.runCount,
    failedRunCount: metrics.failedRunCount,
    selectionRecall: metrics.selectionRecall,
    stepZeroSelectionRecall: metrics.stepZeroSelectionRecall,
    meanKeptShare: metrics.setSize.meanKeptShare,
    sequenceMatch: isMultiStep ? metrics.multiStep.sequenceMatch : null,
    meanExtraCallCount: isMultiStep ? metrics.multiStep.meanExtraCallCount : null,
  };
}

function groupBy<Key>(
  observations: ReadonlyArray<RunObservation>,
  keyOf: (observation: RunObservation) => Key,
): Map<Key, Array<RunObservation>> {
  const groups = new Map<Key, Array<RunObservation>>();
  for (const observation of observations) {
    const groupKey = keyOf(observation);
    const group = groups.get(groupKey) ?? [];
    group.push(observation);
    groups.set(groupKey, group);
  }
  return groups;
}

function compareText(leftText: string, rightText: string): number {
  return leftText < rightText ? -1 : leftText > rightText ? 1 : 0;
}

/** One group per setup and tool count, in setup order, then tool count. */
export function groupObservations(
  observations: ReadonlyArray<RunObservation>,
): Array<SetupGroupMetrics> {
  const groups = groupBy(observations, (observation) => observation.projectName);
  const setupGroups: Array<SetupGroupMetrics> = [];
  for (const groupObservationList of groups.values()) {
    const firstObservation = groupObservationList[0];
    if (firstObservation === undefined) {
      continue;
    }
    const byDifficultyGroups = groupBy(
      groupObservationList,
      (observation) => observation.difficulty,
    );
    const metricsFor = (difficulty: BenchTaskDifficulty): BenchMetrics =>
      aggregateMetrics(byDifficultyGroups.get(difficulty) ?? []);
    const byDifficulty: Record<BenchTaskDifficulty, BenchMetrics> = {
      easy: metricsFor("easy"),
      lookAlike: metricsFor("lookAlike"),
      multiStep: metricsFor("multiStep"),
    };
    const byTaskGroups = groupBy(groupObservationList, (observation) => observation.taskIdentifier);
    const byTask = [...byTaskGroups.keys()]
      .sort(compareText)
      .flatMap((taskIdentifier) => aggregateTask(byTaskGroups.get(taskIdentifier) ?? []) ?? []);
    setupGroups.push({
      setupName: firstObservation.setupName,
      toolCount: firstObservation.toolCount,
      projectName: firstObservation.projectName,
      overall: aggregateMetrics(groupObservationList),
      byDifficulty,
      byTask,
    });
  }
  return setupGroups.sort(
    (leftGroup, rightGroup) =>
      BENCH_SETUP_NAMES.indexOf(leftGroup.setupName) -
        BENCH_SETUP_NAMES.indexOf(rightGroup.setupName) ||
      leftGroup.toolCount - rightGroup.toolCount,
  );
}
