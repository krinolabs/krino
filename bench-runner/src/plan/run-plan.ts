import type { BenchTask, BenchTaskDifficulty } from "@krinolabs/bench";
import type { ToolCount } from "@krinolabs/example-ai-sdk-cli/agent";

// What to run, in what order. Whole cycles only: every task runs once per repeat. The pilot is a
// fixed stratified sample. Tasks are ordered by their stable id, never by list position.

/** baseline: no routing. per-step: prunes on every step (bench only). step-zero: enforce mode. */
export const BENCH_SETUP_NAMES = ["baseline", "per-step", "step-zero"] as const;
export type BenchSetupName = (typeof BENCH_SETUP_NAMES)[number];

export const DIFFICULTY_ORDER: ReadonlyArray<BenchTaskDifficulty> = [
  "easy",
  "lookAlike",
  "multiStep",
];

/** Tasks per difficulty in the 10-run pilot. */
const PILOT_TASK_COUNTS: ReadonlyMap<BenchTaskDifficulty, number> = new Map([
  ["easy", 4],
  ["lookAlike", 3],
  ["multiStep", 3],
]);

export type RunSelection =
  | { selectionKind: "repeats"; repeatCount: number }
  | { selectionKind: "pilot" };

export type PlannedRun = {
  runIndex: number;
  setupName: BenchSetupName;
  toolCount: ToolCount;
  task: BenchTask;
  /** 0-based; always 0 for the pilot. */
  repeatIndex: number;
};

function compareTaskIdentifiers(leftTask: BenchTask, rightTask: BenchTask): number {
  return leftTask.taskIdentifier < rightTask.taskIdentifier
    ? -1
    : leftTask.taskIdentifier > rightTask.taskIdentifier
      ? 1
      : 0;
}

function tasksByDifficulty(
  tasks: ReadonlyArray<BenchTask>,
): Map<BenchTaskDifficulty, Array<BenchTask>> {
  const groupedTasks = new Map<BenchTaskDifficulty, Array<BenchTask>>();
  for (const difficulty of DIFFICULTY_ORDER) {
    groupedTasks.set(
      difficulty,
      tasks.filter((task) => task.difficulty === difficulty).sort(compareTaskIdentifiers),
    );
  }
  return groupedTasks;
}

/** Round-robin over the difficulties (easy, lookAlike, multiStep), each sorted by task id. */
function interleave(groupedTasks: Map<BenchTaskDifficulty, Array<BenchTask>>): Array<BenchTask> {
  const groups = DIFFICULTY_ORDER.map((difficulty) => groupedTasks.get(difficulty) ?? []);
  const longestGroupLength = Math.max(0, ...groups.map((group) => group.length));
  const orderedTasks: Array<BenchTask> = [];
  for (let positionIndex = 0; positionIndex < longestGroupLength; positionIndex += 1) {
    for (const group of groups) {
      const task = group[positionIndex];
      if (task !== undefined) {
        orderedTasks.push(task);
      }
    }
  }
  return orderedTasks;
}

/** Interleaves difficulties, so a run stopped by the spend guard still covers all three. */
export function orderTasksForSchedule(tasks: ReadonlyArray<BenchTask>): Array<BenchTask> {
  return interleave(tasksByDifficulty(tasks));
}

/** 4 easy, 3 lookAlike, 3 multiStep, evenly spaced by task id inside each difficulty. */
export function selectPilotTasks(tasks: ReadonlyArray<BenchTask>): Array<BenchTask> {
  const groupedTasks = tasksByDifficulty(tasks);
  const sampledTasks = new Map<BenchTaskDifficulty, Array<BenchTask>>();
  for (const [difficulty, difficultyTasks] of groupedTasks) {
    const sampleCount = Math.min(PILOT_TASK_COUNTS.get(difficulty) ?? 0, difficultyTasks.length);
    const sample: Array<BenchTask> = [];
    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
      const task =
        difficultyTasks[Math.floor((sampleIndex * difficultyTasks.length) / sampleCount)];
      if (task !== undefined) {
        sample.push(task);
      }
    }
    sampledTasks.set(difficulty, sample);
  }
  return interleave(sampledTasks);
}

export type RunPlanOptions = {
  setupNames: ReadonlyArray<BenchSetupName>;
  toolCounts: ReadonlyArray<ToolCount>;
  runSelection: RunSelection;
  tasks: ReadonlyArray<BenchTask>;
};

/** Order: tool count, then repeat, then task, then setup (the setups run back to back). */
export function buildRunPlan(runPlanOptions: RunPlanOptions): Array<PlannedRun> {
  const { runSelection } = runPlanOptions;
  const scheduledTasks =
    runSelection.selectionKind === "pilot"
      ? selectPilotTasks(runPlanOptions.tasks)
      : orderTasksForSchedule(runPlanOptions.tasks);
  const repeatCount = runSelection.selectionKind === "pilot" ? 1 : runSelection.repeatCount;
  const runPlan: Array<PlannedRun> = [];
  for (const toolCount of runPlanOptions.toolCounts) {
    for (let repeatIndex = 0; repeatIndex < repeatCount; repeatIndex += 1) {
      for (const task of scheduledTasks) {
        for (const setupName of runPlanOptions.setupNames) {
          runPlan.push({ runIndex: runPlan.length, setupName, toolCount, task, repeatIndex });
        }
      }
    }
  }
  return runPlan;
}
