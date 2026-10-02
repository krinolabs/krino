import type nodePath from "node:path";

/** The `path` functions the resolver uses; `path.win32` and `path.posix` both fit. */
export type PathFunctions = Pick<typeof nodePath, "dirname" | "resolve">;

export const TRACE_DIRECTORY_ENVIRONMENT_VARIABLE = "KRINO_TRACE_DIRECTORY";

/** Project name `resolveTraceLocation` asks for when it only needs the traces root. */
const ANY_PROJECT_NAME = "any-project";

/** Everything `resolveTraceLocation` reads from its surroundings. */
export type TraceLocationInputs = {
  /** `--trace-dir`; `null` when not given. Wins over every other folder. */
  traceDirectoryOption: string | null;
  /** `--project`; `null` reads every project. */
  projectName: string | null;
  environment: Readonly<Record<string, string | undefined>>;
  workingDirectory: string;
  /**
   * The file sink's default folder for a project, `<traces root>/<project folder>`:
   * `resolveTraceDirectory` from `@krinolabs/krino`. Asked only when neither `--trace-dir` nor
   * `$KRINO_TRACE_DIRECTORY` is set.
   */
  defaultTraceDirectory: (projectName: string) => string;
  pathModule: PathFunctions;
};

/**
 * Where to look for trace files:
 * - `projectFolder`: one folder that holds trace files directly;
 * - `tracesRoot`: a folder with one subfolder per project.
 */
export type TraceLocation =
  | { locationKind: "projectFolder"; directoryPath: string }
  | { locationKind: "tracesRoot"; directoryPath: string };

/** `traces-2026-10-02.jsonl`, then `traces-2026-10-02.1.jsonl`, `.2`, … after each rotation. */
const TRACE_FILE_NAME_PATTERN = /^traces-(\d{4}-\d{2}-\d{2})(?:\.([1-9]\d*))?\.jsonl$/;

function nonBlank(value: string | null | undefined): string | null {
  return value === undefined || value === null || value.trim() === "" ? null : value;
}

/**
 * The folder to read, in this order:
 * 1. `--trace-dir` (one folder, resolved against the working directory);
 * 2. `$KRINO_TRACE_DIRECTORY` (one folder, possibly shared by several projects);
 * 3. the file sink's default folder for `--project`; without `--project`, its parent (the
 *    traces root), so every project folder is read.
 * Records in a folder from 1 or 2 are still filtered by `--project`.
 */
export function resolveTraceLocation(inputs: TraceLocationInputs): TraceLocation {
  const { pathModule } = inputs;
  const explicitDirectory =
    nonBlank(inputs.traceDirectoryOption) ??
    nonBlank(inputs.environment[TRACE_DIRECTORY_ENVIRONMENT_VARIABLE]);
  if (explicitDirectory !== null) {
    return {
      locationKind: "projectFolder",
      directoryPath: pathModule.resolve(inputs.workingDirectory, explicitDirectory),
    };
  }
  if (inputs.projectName === null) {
    return {
      locationKind: "tracesRoot",
      directoryPath: pathModule.dirname(inputs.defaultTraceDirectory(ANY_PROJECT_NAME)),
    };
  }
  return {
    locationKind: "projectFolder",
    directoryPath: inputs.defaultTraceDirectory(inputs.projectName),
  };
}

// The file-name rule mirrors packages/krino/src/sinks/file/trace-file-name.ts, which
// `@krinolabs/krino` does not export.

/** The UTC day in a trace file name, or `null` for any file that is not a krino trace file. */
export function traceFileUtcDay(fileName: string): string | null {
  return TRACE_FILE_NAME_PATTERN.exec(fileName)?.[1] ?? null;
}

/**
 * Whether a trace file can hold records from `sinceUtcDay` or later. The sink names a file after
 * the UTC day it writes the line, which is never before the record's `recordedAt`.
 */
export function traceFileMayHoldRecordsSince(fileName: string, sinceUtcDay: string): boolean {
  const utcDay = traceFileUtcDay(fileName);
  return utcDay !== null && utcDay >= sinceUtcDay;
}
