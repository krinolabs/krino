import type nodePath from "node:path";

// Mirrors packages/krino/src/sinks/file/trace-directory.ts and trace-file-name.ts. Those helpers
// are not exported from `@krinolabs/krino`, so the CLI keeps a copy. Keep both in step.

/** The `path` functions the resolver uses; `path.win32` and `path.posix` both fit. */
export type PathFunctions = Pick<typeof nodePath, "isAbsolute" | "join" | "resolve">;

export const TRACE_DIRECTORY_ENVIRONMENT_VARIABLE = "KRINO_TRACE_DIRECTORY";
export const XDG_STATE_HOME_ENVIRONMENT_VARIABLE = "XDG_STATE_HOME";

/** Everything `resolveTraceLocation` reads from its surroundings. */
export type TraceLocationInputs = {
  /** `--project`; `null` reads every project. */
  projectName: string | null;
  environment: Readonly<Record<string, string | undefined>>;
  homeDirectory: string;
  workingDirectory: string;
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

const UNNAMED_PROJECT_FOLDER = "unnamed-project";
const WINDOWS_FORBIDDEN_CHARACTERS = new Set(["<", ">", ":", '"', "/", "\\", "|", "?", "*"]);
const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
const FIRST_PRINTABLE_CHARACTER_CODE = 0x20;

/** `traces-2026-10-02.jsonl`, then `traces-2026-10-02.1.jsonl`, `.2`, … after each rotation. */
const TRACE_FILE_NAME_PATTERN = /^traces-(\d{4}-\d{2}-\d{2})(?:\.([1-9]\d*))?\.jsonl$/;

function nonBlank(value: string | undefined): string | null {
  return value === undefined || value.trim() === "" ? null : value;
}

/** Same folder name the file sink uses for a project. */
export function projectFolderName(projectName: string): string {
  const safeCharacters = Array.from(projectName.trim(), (character) =>
    WINDOWS_FORBIDDEN_CHARACTERS.has(character) ||
    character.charCodeAt(0) < FIRST_PRINTABLE_CHARACTER_CODE
      ? "-"
      : character,
  ).join("");
  const folderName = safeCharacters.replace(/[. ]+$/, "");
  if (folderName === "") {
    return UNNAMED_PROJECT_FOLDER;
  }
  return WINDOWS_RESERVED_NAME.test(folderName) ? `${folderName}-project` : folderName;
}

/**
 * The folder the file sink writes to, in the sink's order:
 * 1. `$KRINO_TRACE_DIRECTORY` (one folder, possibly shared by several projects);
 * 2. `$XDG_STATE_HOME/krino/traces/<project>` (ignored unless absolute);
 * 3. `<home>/.krino/traces/<project>`.
 * Without a project name, 2 and 3 read every project folder under `…/krino/traces`.
 */
export function resolveTraceLocation(inputs: TraceLocationInputs): TraceLocation {
  const { environment, pathModule } = inputs;
  const explicitDirectory = nonBlank(environment[TRACE_DIRECTORY_ENVIRONMENT_VARIABLE]);
  if (explicitDirectory !== null) {
    return {
      locationKind: "projectFolder",
      directoryPath: pathModule.resolve(inputs.workingDirectory, explicitDirectory),
    };
  }
  const stateHome = nonBlank(environment[XDG_STATE_HOME_ENVIRONMENT_VARIABLE]);
  const tracesRoot =
    stateHome !== null && pathModule.isAbsolute(stateHome)
      ? pathModule.join(stateHome, "krino", "traces")
      : pathModule.join(inputs.homeDirectory, ".krino", "traces");
  if (inputs.projectName === null) {
    return { locationKind: "tracesRoot", directoryPath: tracesRoot };
  }
  return {
    locationKind: "projectFolder",
    directoryPath: pathModule.join(tracesRoot, projectFolderName(inputs.projectName)),
  };
}

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
