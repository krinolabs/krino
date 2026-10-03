import { describe, expect, it } from "vitest";
import { findMockTool, hasMockTool, MOCK_TOOL_CATALOG } from "../catalog/mock-tool-catalog.js";
import { MOCK_TOOL_DOMAIN_NAMES } from "../catalog/mock-tool-definition.js";
import {
  BENCH_TASKS,
  type BenchTask,
  type BenchTaskDifficulty,
  defineBenchTasks,
} from "./bench-tasks.js";

/** A fixed-seed Fisher–Yates shuffle of a copy: the same order on every run. */
function shuffledCopy<Item>(items: ReadonlyArray<Item>, seed: number): Array<Item> {
  const shuffledItems = [...items];
  let state = seed;
  for (let itemIndex = shuffledItems.length - 1; itemIndex > 0; itemIndex -= 1) {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    const swapIndex = state % (itemIndex + 1);
    const currentItem = shuffledItems[itemIndex] as Item; // index is in range
    shuffledItems[itemIndex] = shuffledItems[swapIndex] as Item; // index is in range
    shuffledItems[swapIndex] = currentItem;
  }
  return shuffledItems;
}

function expectedToolNamesByIdentifier(benchTasks: ReadonlyArray<BenchTask>) {
  return new Map(
    benchTasks.map((benchTask) => [benchTask.taskIdentifier, benchTask.expectedToolNames]),
  );
}

const LOOK_ALIKE_PAIR_MEMBERS = new Set(
  MOCK_TOOL_CATALOG.flatMap((toolDefinition) =>
    toolDefinition.lookAlikeOf === undefined
      ? []
      : [toolDefinition.toolName, toolDefinition.lookAlikeOf],
  ),
);

function tasksWithDifficulty(difficulty: BenchTaskDifficulty) {
  return BENCH_TASKS.filter((benchTask) => benchTask.difficulty === difficulty);
}

describe("BENCH_TASKS", () => {
  it("has 60 tasks with unique identifiers and texts", () => {
    expect(BENCH_TASKS).toHaveLength(60);
    expect(new Set(BENCH_TASKS.map((benchTask) => benchTask.taskIdentifier)).size).toBe(60);
    expect(new Set(BENCH_TASKS.map((benchTask) => benchTask.taskText)).size).toBe(60);
  });

  it("numbers tasks task-001 to task-060 in order", () => {
    expect(BENCH_TASKS[0]?.taskIdentifier).toBe("task-001");
    expect(BENCH_TASKS[59]?.taskIdentifier).toBe("task-060");
  });

  it("has 20 tasks of each difficulty", () => {
    expect(tasksWithDifficulty("easy")).toHaveLength(20);
    expect(tasksWithDifficulty("lookAlike")).toHaveLength(20);
    expect(tasksWithDifficulty("multiStep")).toHaveLength(20);
  });

  it("only expects tools that exist in the catalog", () => {
    for (const benchTask of BENCH_TASKS) {
      expect(benchTask.expectedToolNames.length, benchTask.taskIdentifier).toBeGreaterThan(0);
      for (const expectedToolName of benchTask.expectedToolNames) {
        expect(
          hasMockTool(expectedToolName),
          `${benchTask.taskIdentifier}: ${expectedToolName}`,
        ).toBe(true);
      }
    }
  });

  it("expects one tool for easy and look-alike tasks", () => {
    for (const benchTask of [...tasksWithDifficulty("easy"), ...tasksWithDifficulty("lookAlike")]) {
      expect(benchTask.expectedToolNames, benchTask.taskIdentifier).toHaveLength(1);
    }
  });

  it("targets a member of a look-alike pair in every look-alike task", () => {
    for (const benchTask of tasksWithDifficulty("lookAlike")) {
      const expectedToolName = benchTask.expectedToolNames[0] ?? "";
      expect(LOOK_ALIKE_PAIR_MEMBERS.has(expectedToolName), benchTask.taskIdentifier).toBe(true);
    }
  });

  it("expects two or more distinct tools in every multi-step task", () => {
    for (const benchTask of tasksWithDifficulty("multiStep")) {
      expect(benchTask.expectedToolNames.length, benchTask.taskIdentifier).toBeGreaterThanOrEqual(
        2,
      );
      expect(new Set(benchTask.expectedToolNames).size).toBe(benchTask.expectedToolNames.length);
    }
  });

  it.each(MOCK_TOOL_DOMAIN_NAMES)("has two easy and two look-alike tasks in %s", (domainName) => {
    const singleToolTasks = [...tasksWithDifficulty("easy"), ...tasksWithDifficulty("lookAlike")];
    const domainTasks = singleToolTasks.filter(
      (benchTask) => findMockTool(benchTask.expectedToolNames[0] ?? "")?.domainName === domainName,
    );
    expect(domainTasks.filter((benchTask) => benchTask.difficulty === "easy")).toHaveLength(2);
    expect(domainTasks.filter((benchTask) => benchTask.difficulty === "lookAlike")).toHaveLength(2);
  });
});

describe("BENCH_TASKS identifiers", () => {
  it("are unique and look like task-NNN", () => {
    const taskIdentifiers = BENCH_TASKS.map((benchTask) => benchTask.taskIdentifier);
    expect(new Set(taskIdentifiers).size).toBe(BENCH_TASKS.length);
    for (const taskIdentifier of taskIdentifiers) {
      expect(taskIdentifier).toMatch(/^task-\d{3}$/);
    }
  });

  it.each([1, 7, 42])("do not change when the task list is reordered (seed %i)", (seed) => {
    const reorderedTasks = defineBenchTasks(shuffledCopy(BENCH_TASKS, seed));

    expect(reorderedTasks.map((benchTask) => benchTask.taskIdentifier)).not.toEqual(
      BENCH_TASKS.map((benchTask) => benchTask.taskIdentifier),
    );
    expect(expectedToolNamesByIdentifier(reorderedTasks)).toEqual(
      expectedToolNamesByIdentifier(BENCH_TASKS),
    );
  });

  it("rejects a repeated or malformed identifier", () => {
    const [firstTask, secondTask] = BENCH_TASKS;
    if (firstTask === undefined || secondTask === undefined) {
      throw new Error("BENCH_TASKS needs at least two tasks");
    }
    expect(() =>
      defineBenchTasks([firstTask, { ...secondTask, taskIdentifier: firstTask.taskIdentifier }]),
    ).toThrow(`Repeated bench task identifier: ${firstTask.taskIdentifier}`);
    expect(() => defineBenchTasks([{ ...firstTask, taskIdentifier: "task-1" }])).toThrow(
      'Bench task identifier "task-1" must look like task-NNN',
    );
  });

  it("map to the same expected tools as before (review any change to this snapshot)", () => {
    const expectedToolNamesByIdentifier = Object.fromEntries(
      BENCH_TASKS.map((benchTask) => [benchTask.taskIdentifier, benchTask.expectedToolNames]),
    );
    expect(expectedToolNamesByIdentifier).toMatchSnapshot();
  });
});
