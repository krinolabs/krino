import { describe, expect, it } from "vitest";
import {
  formatTraceFileName,
  latestRotationIndex,
  parseTraceFileName,
  TRACE_FILE_ROTATION_SIZE_IN_BYTES,
  utcDayOf,
} from "./trace-file-name.js";

describe("trace file names", () => {
  it("names the first file of a day traces-YYYY-MM-DD.jsonl", () => {
    expect(formatTraceFileName({ utcDay: "2026-10-02", rotationIndex: 0 })).toBe(
      "traces-2026-10-02.jsonl",
    );
  });

  it("numbers rotated files", () => {
    expect(formatTraceFileName({ utcDay: "2026-10-02", rotationIndex: 3 })).toBe(
      "traces-2026-10-02.3.jsonl",
    );
  });

  it("uses the UTC day, not the local day", () => {
    expect(utcDayOf(new Date("2026-10-02T23:30:00-05:00"))).toBe("2026-10-03");
    expect(utcDayOf(new Date("2026-10-03T00:30:00+02:00"))).toBe("2026-10-02");
  });

  it("parses its own names and ignores other files", () => {
    expect(parseTraceFileName("traces-2026-10-02.jsonl")).toEqual({
      utcDay: "2026-10-02",
      rotationIndex: 0,
    });
    expect(parseTraceFileName("traces-2026-10-02.12.jsonl")).toEqual({
      utcDay: "2026-10-02",
      rotationIndex: 12,
    });
    expect(parseTraceFileName("traces-2026-10-02.0.jsonl")).toBeNull();
    expect(parseTraceFileName("traces-2026-10-02.jsonl.bak")).toBeNull();
    expect(parseTraceFileName("notes.txt")).toBeNull();
  });

  it("finds the latest rotation index for a day", () => {
    const fileNames = [
      "traces-2026-10-01.7.jsonl",
      "traces-2026-10-02.jsonl",
      "traces-2026-10-02.2.jsonl",
      "traces-2026-10-02.10.jsonl",
      "README.md",
    ];
    expect(latestRotationIndex(fileNames, "2026-10-02")).toBe(10);
    expect(latestRotationIndex(fileNames, "2026-10-03")).toBe(0);
  });

  it("rotates at 50 MB", () => {
    expect(TRACE_FILE_ROTATION_SIZE_IN_BYTES).toBe(52_428_800);
  });
});
