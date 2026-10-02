import nodePath from "node:path";
import { describe, expect, it } from "vitest";
import {
  projectFolderName,
  resolveTraceLocation,
  traceFileMayHoldRecordsSince,
  traceFileUtcDay,
} from "./trace-directory.js";

const posixInputs = {
  traceDirectoryOption: null,
  homeDirectory: "/home/me",
  workingDirectory: "/work",
  pathModule: nodePath.posix,
};

describe("resolveTraceLocation", () => {
  it("reads --trace-dir first, then $KRINO_TRACE_DIRECTORY, then the default folder", () => {
    const environment = { KRINO_TRACE_DIRECTORY: "/from-environment" };
    expect(
      resolveTraceLocation({
        ...posixInputs,
        traceDirectoryOption: "/from-option",
        projectName: "shop",
        environment,
      }),
    ).toEqual({ locationKind: "projectFolder", directoryPath: "/from-option" });
    expect(resolveTraceLocation({ ...posixInputs, projectName: "shop", environment })).toEqual({
      locationKind: "projectFolder",
      directoryPath: "/from-environment",
    });
    expect(
      resolveTraceLocation({
        ...posixInputs,
        traceDirectoryOption: " ",
        projectName: "shop",
        environment: {},
      }),
    ).toEqual({ locationKind: "projectFolder", directoryPath: "/home/me/.krino/traces/shop" });
  });

  it("reads $KRINO_TRACE_DIRECTORY as one folder, resolved against the working directory", () => {
    expect(
      resolveTraceLocation({
        ...posixInputs,
        projectName: "shop",
        environment: { KRINO_TRACE_DIRECTORY: "traces" },
      }),
    ).toEqual({ locationKind: "projectFolder", directoryPath: "/work/traces" });
  });

  it("uses an absolute $XDG_STATE_HOME and ignores a relative one", () => {
    expect(
      resolveTraceLocation({
        ...posixInputs,
        projectName: "shop",
        environment: { XDG_STATE_HOME: "/state" },
      }),
    ).toEqual({ locationKind: "projectFolder", directoryPath: "/state/krino/traces/shop" });
    expect(
      resolveTraceLocation({
        ...posixInputs,
        projectName: "shop",
        environment: { XDG_STATE_HOME: "state" },
      }),
    ).toEqual({ locationKind: "projectFolder", directoryPath: "/home/me/.krino/traces/shop" });
  });

  it("reads every project folder without --project", () => {
    expect(resolveTraceLocation({ ...posixInputs, projectName: null, environment: {} })).toEqual({
      locationKind: "tracesRoot",
      directoryPath: "/home/me/.krino/traces",
    });
  });

  it("ignores a blank $KRINO_TRACE_DIRECTORY", () => {
    expect(
      resolveTraceLocation({
        ...posixInputs,
        projectName: null,
        environment: { KRINO_TRACE_DIRECTORY: "  " },
      }).locationKind,
    ).toBe("tracesRoot");
  });

  it("uses Windows path rules with path.win32", () => {
    expect(
      resolveTraceLocation({
        traceDirectoryOption: null,
        projectName: "shop",
        environment: {},
        homeDirectory: "C:\\Users\\me",
        workingDirectory: "C:\\work",
        pathModule: nodePath.win32,
      }),
    ).toEqual({
      locationKind: "projectFolder",
      directoryPath: "C:\\Users\\me\\.krino\\traces\\shop",
    });
  });
});

describe("projectFolderName (same rules as the file sink)", () => {
  it.each([
    ["shop", "shop"],
    ["a/b\\c:d", "a-b-c-d"],
    ["trailing. ", "trailing"],
    ["   ", "unnamed-project"],
    ["CON", "CON-project"],
    ["constructor", "constructor"],
    ["__proto__", "__proto__"],
  ])("%j becomes %j", (projectName, folderName) => {
    expect(projectFolderName(projectName)).toBe(folderName);
  });
});

describe("trace file names", () => {
  it("reads the UTC day of trace files only", () => {
    expect(traceFileUtcDay("traces-2026-10-02.jsonl")).toBe("2026-10-02");
    expect(traceFileUtcDay("traces-2026-10-02.3.jsonl")).toBe("2026-10-02");
    expect(traceFileUtcDay("traces-2026-10-02.0.jsonl")).toBeNull();
    expect(traceFileUtcDay("notes.txt")).toBeNull();
  });

  it("keeps files from the since day on", () => {
    expect(traceFileMayHoldRecordsSince("traces-2026-09-30.jsonl", "2026-09-30")).toBe(true);
    expect(traceFileMayHoldRecordsSince("traces-2026-09-29.1.jsonl", "2026-09-30")).toBe(false);
    expect(traceFileMayHoldRecordsSince("other.jsonl", "2000-01-01")).toBe(false);
  });
});
