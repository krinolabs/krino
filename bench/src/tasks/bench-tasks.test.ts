import { describe, expect, it } from "vitest";
import { findMockTool, hasMockTool, MOCK_TOOL_CATALOG } from "../catalog/mock-tool-catalog.js";
import { MOCK_TOOL_DOMAIN_NAMES } from "../catalog/mock-tool-definition.js";
import { BENCH_TASKS, type BenchTaskDifficulty } from "./bench-tasks.js";

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
