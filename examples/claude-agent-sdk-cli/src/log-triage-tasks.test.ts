import { BENCH_TASKS, executeMockTool } from "@krinolabs/bench";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_TASK_IDENTIFIER,
  EXAMPLE_TASKS,
  resolveExampleTask,
  TASK_IDENTIFIERS,
} from "./log-triage-tasks.js";
import { classifyTool } from "./risk-policy.js";

describe("EXAMPLE_TASKS", () => {
  it("defaults to the read-only request-trace task", () => {
    const defaultTask = resolveExampleTask(DEFAULT_TASK_IDENTIFIER);
    expect(defaultTask.taskText).toContain("REQ-7f3a");
    for (const toolName of defaultTask.expectedToolNames) {
      expect(classifyTool(toolName).toolRisk).toBe("readOnly");
    }
  });

  it("has a second task that calls a write tool", () => {
    const writeTasks = TASK_IDENTIFIERS.map(resolveExampleTask).filter((exampleTask) =>
      exampleTask.expectedToolNames.some((toolName) => classifyTool(toolName).toolRisk === "write"),
    );
    expect(writeTasks.map((exampleTask) => exampleTask.taskIdentifier)).toEqual(["task-052"]);
  });

  it.each(EXAMPLE_TASKS.map((exampleTask) => exampleTask.taskIdentifier))(
    "%s is a bench task, scripted with its expected tools in order",
    (taskIdentifier) => {
      const benchTask = BENCH_TASKS.find((task) => task.taskIdentifier === taskIdentifier);
      const exampleTask = resolveExampleTask(taskIdentifier);
      expect(benchTask).toBeDefined();
      expect(exampleTask.taskText).toBe(benchTask?.taskText);
      expect(exampleTask.scriptedToolCalls.map((toolCall) => toolCall.toolName)).toEqual(
        benchTask?.expectedToolNames,
      );
    },
  );

  it.each(EXAMPLE_TASKS.flatMap((exampleTask) => exampleTask.scriptedToolCalls))(
    "scripts valid input for $toolName",
    (scriptedToolCall) => {
      const executionOutcome = executeMockTool(
        scriptedToolCall.toolName,
        scriptedToolCall.toolInput,
      );
      expect(executionOutcome.executionStatus).toBe("succeeded");
    },
  );

  it.each(["task-999", "constructor", "__proto__"])("does not resolve %s", (taskIdentifier) => {
    expect(() => resolveExampleTask(taskIdentifier)).toThrow(taskIdentifier);
  });
});
