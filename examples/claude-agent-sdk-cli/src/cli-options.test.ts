import { describe, expect, it } from "vitest";
import { CliUsageError, parseCliOptions } from "./cli-options.js";

describe("parseCliOptions", () => {
  it("defaults to a live run of the default task on the full catalog", () => {
    expect(parseCliOptions([])).toEqual({
      isFake: false,
      traceDirectory: null,
      toolCount: 100,
      taskIdentifier: "task-059",
      showHelp: false,
    });
  });

  it("reads --fake, --trace-dir, --tools and --task", () => {
    expect(
      parseCliOptions(["--fake", "--trace-dir", "traces", "--tools", "25", "--task", "task-052"]),
    ).toEqual({
      isFake: true,
      traceDirectory: "traces",
      toolCount: 25,
      taskIdentifier: "task-052",
      showHelp: false,
    });
  });

  it.each(["10", "25", "50", "100"])("accepts --tools %s", (toolCountText) => {
    expect(parseCliOptions(["--tools", toolCountText]).toolCount).toBe(Number(toolCountText));
  });

  it.each(["7", "0", "abc", "10.5", ""])("rejects --tools %s", (toolCountText) => {
    expect(() => parseCliOptions(["--tools", toolCountText])).toThrow(CliUsageError);
    expect(() => parseCliOptions(["--tools", toolCountText])).toThrow("10, 25, 50 or 100");
  });

  it.each(["task-001", "task-999", "constructor", "__proto__", ""])(
    "rejects --task %s, naming the tasks it accepts",
    (taskIdentifier) => {
      expect(() => parseCliOptions(["--task", taskIdentifier])).toThrow(CliUsageError);
      expect(() => parseCliOptions(["--task", taskIdentifier])).toThrow("task-059 or task-052");
    },
  );

  it("rejects an unknown option", () => {
    expect(() => parseCliOptions(["--live"])).toThrow(CliUsageError);
  });

  it("reads --help", () => {
    expect(parseCliOptions(["--help"]).showHelp).toBe(true);
  });
});
