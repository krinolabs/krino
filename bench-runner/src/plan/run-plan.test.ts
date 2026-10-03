import { BENCH_TASKS, type BenchTask } from "@krinolabs/bench";
import { describe, expect, it } from "vitest";
import {
  BENCH_SETUP_NAMES,
  buildRunPlan,
  orderTasksForSchedule,
  selectPilotTasks,
} from "./run-plan.js";

function countBy<Item>(
  items: ReadonlyArray<Item>,
  keyOf: (item: Item) => string,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(keyOf(item), (counts.get(keyOf(item)) ?? 0) + 1);
  }
  return counts;
}

describe("selectPilotTasks", () => {
  it("is a stratified sample of 10: 4 easy, 3 lookAlike, 3 multiStep", () => {
    const pilotTasks = selectPilotTasks(BENCH_TASKS);
    expect(pilotTasks).toHaveLength(10);
    const byDifficulty = countBy(pilotTasks, (task) => task.difficulty);
    expect(Object.fromEntries(byDifficulty)).toEqual({ easy: 4, lookAlike: 3, multiStep: 3 });
  });

  it("picks the same task ids whatever the input order", () => {
    const reversedTasks = [...BENCH_TASKS].reverse();
    const pilotIds = selectPilotTasks(BENCH_TASKS).map((task) => task.taskIdentifier);
    expect(selectPilotTasks(reversedTasks).map((task) => task.taskIdentifier)).toEqual(pilotIds);
    expect(pilotIds).toMatchInlineSnapshot(`
      [
        "task-001",
        "task-021",
        "task-041",
        "task-006",
        "task-027",
        "task-047",
        "task-011",
        "task-034",
        "task-054",
        "task-016",
      ]
    `);
  });
});

describe("orderTasksForSchedule", () => {
  it("interleaves difficulties so a run stopped early still covers all three", () => {
    const orderedTasks = orderTasksForSchedule(BENCH_TASKS);
    expect(orderedTasks.slice(0, 3).map((task) => task.difficulty)).toEqual([
      "easy",
      "lookAlike",
      "multiStep",
    ]);
    expect(orderedTasks).toHaveLength(BENCH_TASKS.length);
  });

  it("orders by task id inside a difficulty, never by list position", () => {
    const shuffledTasks: Array<BenchTask> = [...BENCH_TASKS].reverse();
    expect(orderTasksForSchedule(shuffledTasks)).toEqual(orderTasksForSchedule(BENCH_TASKS));
  });
});

describe("buildRunPlan", () => {
  it("runs every task once per repeat, for every setup and tool count", () => {
    const runPlan = buildRunPlan({
      setupNames: BENCH_SETUP_NAMES,
      toolCounts: [100],
      runSelection: { selectionKind: "repeats", repeatCount: 2 },
      tasks: BENCH_TASKS,
    });
    expect(runPlan).toHaveLength(BENCH_TASKS.length * 2 * 3);
    const perSetupAndTask = countBy(
      runPlan,
      (plannedRun) => `${plannedRun.setupName}/${plannedRun.task.taskIdentifier}`,
    );
    expect(new Set(perSetupAndTask.values())).toEqual(new Set([2]));
    expect(runPlan.map((plannedRun) => plannedRun.runIndex)).toEqual(
      runPlan.map((_plannedRun, runIndex) => runIndex),
    );
  });

  it("runs the setups back to back for each task, so a spend stop keeps them comparable", () => {
    const runPlan = buildRunPlan({
      setupNames: BENCH_SETUP_NAMES,
      toolCounts: [100],
      runSelection: { selectionKind: "repeats", repeatCount: 1 },
      tasks: BENCH_TASKS,
    });
    expect(runPlan.slice(0, 3).map((plannedRun) => plannedRun.setupName)).toEqual([
      "baseline",
      "per-step",
      "step-zero",
    ]);
    expect(
      new Set(runPlan.slice(0, 3).map((plannedRun) => plannedRun.task.taskIdentifier)).size,
    ).toBe(1);
  });

  it("gives the pilot 10 runs per setup and tool count", () => {
    const runPlan = buildRunPlan({
      setupNames: ["step-zero"],
      toolCounts: [10, 25, 50, 100],
      runSelection: { selectionKind: "pilot" },
      tasks: BENCH_TASKS,
    });
    const perToolCount = countBy(runPlan, (plannedRun) => String(plannedRun.toolCount));
    expect(Object.fromEntries(perToolCount)).toEqual({ "10": 10, "25": 10, "50": 10, "100": 10 });
  });
});
