import type nodePath from "node:path";

/** The `path` functions the resolver uses; `path.win32` and `path.posix` both fit. */
export type PathFunctions = Pick<typeof nodePath, "isAbsolute" | "join" | "resolve">;

/** Everything `resolveTraceDirectory` reads from its surroundings. */
export type TraceDirectoryInputs = {
  /** Explicit directory from `createFileTraceSink`; wins over every default. */
  traceDirectory?: string | undefined;
  projectName: string;
  environment: Readonly<Record<string, string | undefined>>;
  homeDirectory: string;
  /** Relative directories resolve against it. */
  workingDirectory: string;
  /** `path.win32` or `path.posix`; injectable so Windows rules are testable on any OS. */
  pathModule: PathFunctions;
};

export const TRACE_DIRECTORY_ENVIRONMENT_VARIABLE = "KRINO_TRACE_DIRECTORY";
export const XDG_STATE_HOME_ENVIRONMENT_VARIABLE = "XDG_STATE_HOME";

const UNNAMED_PROJECT_FOLDER = "unnamed-project";
const WINDOWS_FORBIDDEN_CHARACTERS = new Set(["<", ">", ":", '"', "/", "\\", "|", "?", "*"]);
const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
const FIRST_PRINTABLE_CHARACTER_CODE = 0x20;

function nonBlank(value: string | undefined): string | null {
  return value === undefined || value.trim() === "" ? null : value;
}

/**
 * Turns a project name into one folder name that is valid on Windows, macOS and Linux:
 * no path separators, no characters Windows forbids, no trailing dots or spaces, no device names.
 */
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
 * The trace directory, in order:
 * 1. the explicit `traceDirectory`;
 * 2. `$KRINO_TRACE_DIRECTORY`;
 * 3. `$XDG_STATE_HOME/krino/traces/<project>` (ignored unless absolute, as the XDG spec says);
 * 4. `<home>/.krino/traces/<project>`.
 */
export function resolveTraceDirectory(inputs: TraceDirectoryInputs): string {
  const { environment, pathModule, workingDirectory } = inputs;
  const explicitDirectory =
    nonBlank(inputs.traceDirectory) ?? nonBlank(environment[TRACE_DIRECTORY_ENVIRONMENT_VARIABLE]);
  if (explicitDirectory !== null) {
    return pathModule.resolve(workingDirectory, explicitDirectory);
  }
  const projectFolder = projectFolderName(inputs.projectName);
  const stateHome = nonBlank(environment[XDG_STATE_HOME_ENVIRONMENT_VARIABLE]);
  if (stateHome !== null && pathModule.isAbsolute(stateHome)) {
    return pathModule.join(stateHome, "krino", "traces", projectFolder);
  }
  return pathModule.join(inputs.homeDirectory, ".krino", "traces", projectFolder);
}
