import nodePath from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolveTraceLocation,
  type TraceLocationInputs,
  traceFileMayHoldRecordsSince,
  traceFileUtcDay,
} from "./trace-directory.js";

const posixInputs: TraceLocationInputs = {
  traceDirectoryOption: null,
  projectName: "shop",
  environment: {},
  workingDirectory: "/work",
  defaultTraceDirectory: (projectName) => `/home/me/.krino/traces/${projectName}`,
  pathModule: nodePath.posix,
};

describe("resolveTraceLocation", () => {
  it("reads --trace-dir first, then $KRINO_TRACE_DIRECTORY, then the default folder", () => {
    const environment = { KRINO_TRACE_DIRECTORY: "/from-environment" };
    expect(
      resolveTraceLocation({ ...posixInputs, traceDirectoryOption: "/from-option", environment }),
    ).toEqual({ locationKind: "projectFolder", directoryPath: "/from-option" });
    expect(resolveTraceLocation({ ...posixInputs, environment })).toEqual({
      locationKind: "projectFolder",
      directoryPath: "/from-environment",
    });
    expect(resolveTraceLocation(posixInputs)).toEqual({
      locationKind: "projectFolder",
      directoryPath: "/home/me/.krino/traces/shop",
    });
  });

  it("resolves a relative folder against the working directory", () => {
    expect(
      resolveTraceLocation({ ...posixInputs, environment: { KRINO_TRACE_DIRECTORY: "traces" } }),
    ).toEqual({ locationKind: "projectFolder", directoryPath: "/work/traces" });
    expect(resolveTraceLocation({ ...posixInputs, traceDirectoryOption: "../t" })).toEqual({
      locationKind: "projectFolder",
      directoryPath: "/t",
    });
  });

  it("skips blank values", () => {
    expect(
      resolveTraceLocation({
        ...posixInputs,
        traceDirectoryOption: " ",
        environment: { KRINO_TRACE_DIRECTORY: "  " },
      }).directoryPath,
    ).toBe("/home/me/.krino/traces/shop");
  });

  it("reads the traces root (the default folder's parent) without --project", () => {
    expect(resolveTraceLocation({ ...posixInputs, projectName: null })).toEqual({
      locationKind: "tracesRoot",
      directoryPath: "/home/me/.krino/traces",
    });
  });

  it("uses Windows path rules with path.win32", () => {
    expect(
      resolveTraceLocation({
        ...posixInputs,
        projectName: null,
        workingDirectory: "C:\\work",
        defaultTraceDirectory: (projectName) => `C:\\Users\\me\\.krino\\traces\\${projectName}`,
        pathModule: nodePath.win32,
      }),
    ).toEqual({ locationKind: "tracesRoot", directoryPath: "C:\\Users\\me\\.krino\\traces" });
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
