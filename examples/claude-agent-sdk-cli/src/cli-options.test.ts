import { describe, expect, it } from "vitest";
import { CliUsageError, parseCliOptions } from "./cli-options.js";

describe("parseCliOptions", () => {
  it("defaults to a live run on the full catalog, with the default trace folder", () => {
    expect(parseCliOptions([])).toEqual({
      isFake: false,
      traceDirectory: null,
      toolCount: 100,
      showHelp: false,
    });
  });

  it("reads --fake, --trace-dir and --tools", () => {
    expect(parseCliOptions(["--fake", "--trace-dir", "traces", "--tools", "25"])).toEqual({
      isFake: true,
      traceDirectory: "traces",
      toolCount: 25,
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

  it("rejects an unknown option", () => {
    expect(() => parseCliOptions(["--live"])).toThrow(CliUsageError);
  });

  it("reads --help", () => {
    expect(parseCliOptions(["--help"]).showHelp).toBe(true);
  });
});
