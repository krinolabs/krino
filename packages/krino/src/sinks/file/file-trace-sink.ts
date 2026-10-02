import { appendFile, mkdir, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import nodePath from "node:path";
import type { AgentStepTrace, RunSummaryTrace, TraceSink } from "../../contracts/index.js";
import { DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS } from "../../contracts/index.js";
import { resolveTraceDirectory } from "./trace-directory.js";
import {
  formatTraceFileName,
  latestRotationIndex,
  TRACE_FILE_ROTATION_SIZE_IN_BYTES,
  type TraceFileName,
  utcDayOf,
} from "./trace-file-name.js";

export type FileTraceSinkOptions = {
  projectName: string;
  /**
   * Default: `$KRINO_TRACE_DIRECTORY`, else `$XDG_STATE_HOME/krino/traces/<project>`,
   * else `~/.krino/traces/<project>`.
   */
  traceDirectory?: string;
};

/** The file operations the sink needs. Injectable for tests. */
export type TraceFileSystem = {
  createDirectory: (directoryPath: string) => Promise<unknown>;
  listDirectory: (directoryPath: string) => Promise<Array<string>>;
  /** 0 when the file does not exist. */
  fileSizeInBytes: (filePath: string) => Promise<number>;
  appendText: (filePath: string, text: string) => Promise<void>;
};

/** Everything the sink takes from its surroundings. Injectable for tests. */
export type FileTraceSinkDependencies = {
  currentTime: () => Date;
  environment: Readonly<Record<string, string | undefined>>;
  homeDirectory: () => string;
  workingDirectory: () => string;
  rotationSizeInBytes: number;
  fileSystem: TraceFileSystem;
  writeToStandardError: (message: string) => void;
};

export type FileTraceSink = TraceSink & {
  /** Absolute directory the sink writes to; `null` when it could not be resolved. */
  readonly traceDirectory: string | null;
};

type BufferedLine = {
  utcDay: string;
  line: string;
};

const OWNER_ONLY_DIRECTORY_MODE = 0o700;
const OWNER_ONLY_FILE_MODE = 0o600;

function isMissingFileError(fileError: unknown): boolean {
  return (
    typeof fileError === "object" &&
    fileError !== null &&
    "code" in fileError &&
    fileError.code === "ENOENT"
  );
}

export const nodeTraceFileSystem: TraceFileSystem = {
  createDirectory: (directoryPath) =>
    mkdir(directoryPath, { recursive: true, mode: OWNER_ONLY_DIRECTORY_MODE }),
  listDirectory: (directoryPath) => readdir(directoryPath),
  fileSizeInBytes: async (filePath) => {
    try {
      return (await stat(filePath)).size;
    } catch (statError) {
      if (isMissingFileError(statError)) {
        return 0;
      }
      throw statError;
    }
  },
  appendText: (filePath, text) =>
    appendFile(filePath, text, { encoding: "utf8", flag: "a", mode: OWNER_ONLY_FILE_MODE }),
};

export function defaultFileTraceSinkDependencies(): FileTraceSinkDependencies {
  return {
    currentTime: () => new Date(),
    environment: process.env,
    homeDirectory: homedir,
    workingDirectory: () => process.cwd(),
    rotationSizeInBytes: TRACE_FILE_ROTATION_SIZE_IN_BYTES,
    fileSystem: nodeTraceFileSystem,
    writeToStandardError: (message) => {
      process.stderr.write(`${message}\n`);
    },
  };
}

function describeError(caughtError: unknown): string {
  return caughtError instanceof Error ? caughtError.message : String(caughtError);
}

/** Resolves when the promise settles or the timeout passes, whichever comes first. Never rejects. */
function waitAtMost(timeoutInMilliseconds: number, waitedPromise: Promise<unknown>): Promise<void> {
  return new Promise<void>((resolveWait) => {
    const timeoutHandle = setTimeout(resolveWait, timeoutInMilliseconds);
    const finishWait = (): void => {
      clearTimeout(timeoutHandle);
      resolveWait();
    };
    waitedPromise.then(finishWait, finishWait);
  });
}

function usableTimeout(timeoutInMilliseconds: number): number {
  return Number.isFinite(timeoutInMilliseconds) && timeoutInMilliseconds >= 0
    ? timeoutInMilliseconds
    : DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS;
}

/** Splits a batch into runs of lines for the same UTC day, keeping their order. */
function groupConsecutiveLinesByDay(
  bufferedLines: ReadonlyArray<BufferedLine>,
): Array<{ utcDay: string; lines: Array<string> }> {
  const dayGroups: Array<{ utcDay: string; lines: Array<string> }> = [];
  for (const bufferedLine of bufferedLines) {
    const lastGroup = dayGroups.at(-1);
    if (lastGroup !== undefined && lastGroup.utcDay === bufferedLine.utcDay) {
      lastGroup.lines.push(bufferedLine.line);
    } else {
      dayGroups.push({ utcDay: bufferedLine.utcDay, lines: [bufferedLine.line] });
    }
  }
  return dayGroups;
}

/**
 * A `TraceSink` that appends one JSON object per line to `traces-YYYY-MM-DD.jsonl` (UTC day)
 * and rotates to `traces-YYYY-MM-DD.1.jsonl`, `.2`, … at 50 MB.
 *
 * `writeRecord` only buffers; lines are written in the background, in order, by one writer.
 * `flush(timeout)` resolves once the buffer is on disk or the timeout passes.
 * Durable when the process exits; not protected against power loss (the sink does not fsync).
 * Nothing here throws into the host: the first failure is logged once to stderr, the failed
 * lines are dropped, and later writes are tried again.
 */
export function createFileTraceSink(
  sinkOptions: FileTraceSinkOptions,
  dependencyOverrides: Partial<FileTraceSinkDependencies> = {},
): FileTraceSink {
  const dependencies: FileTraceSinkDependencies = {
    ...defaultFileTraceSinkDependencies(),
    ...dependencyOverrides,
  };
  const { fileSystem } = dependencies;

  let failureReported = false;
  const reportFailureOnce = (failureMessage: string): void => {
    if (failureReported) {
      return;
    }
    failureReported = true;
    try {
      dependencies.writeToStandardError(
        `krino: ${failureMessage}; trace lines are being dropped. Later trace sink errors are not shown.`,
      );
    } catch {
      // Nowhere left to report to.
    }
  };

  let traceDirectory: string | null = null;
  let directoryProblem = "";
  try {
    traceDirectory = resolveTraceDirectory({
      traceDirectory: sinkOptions.traceDirectory,
      projectName: sinkOptions.projectName,
      environment: dependencies.environment,
      homeDirectory: dependencies.homeDirectory(),
      workingDirectory: dependencies.workingDirectory(),
      pathModule: nodePath,
    });
  } catch (resolveError) {
    directoryProblem = describeError(resolveError);
  }

  let bufferedLines: Array<BufferedLine> = [];
  let activeTraceFile: TraceFileName | null = null;
  let drainInProgress: Promise<void> | null = null;

  const appendLinesForDay = async (
    directoryPath: string,
    utcDay: string,
    lines: ReadonlyArray<string>,
  ): Promise<void> => {
    let traceFile = activeTraceFile;
    if (traceFile === null || traceFile.utcDay !== utcDay) {
      await fileSystem.createDirectory(directoryPath);
      const fileNames = await fileSystem.listDirectory(directoryPath);
      traceFile = { utcDay, rotationIndex: latestRotationIndex(fileNames, utcDay) };
      activeTraceFile = traceFile;
    }
    const pathOf = (traceFileName: TraceFileName): string =>
      nodePath.join(directoryPath, formatTraceFileName(traceFileName));

    // Other processes may append to the same file, so ask the disk for its size.
    let fileSize = await fileSystem.fileSizeInBytes(pathOf(traceFile));
    let pendingText = "";
    let pendingSize = 0;
    for (const line of lines) {
      const lineSize = Buffer.byteLength(line, "utf8");
      while (
        fileSize + pendingSize + lineSize > dependencies.rotationSizeInBytes &&
        fileSize + pendingSize > 0
      ) {
        if (pendingText !== "") {
          await fileSystem.appendText(pathOf(traceFile), pendingText);
        }
        traceFile = { utcDay, rotationIndex: traceFile.rotationIndex + 1 };
        activeTraceFile = traceFile;
        fileSize = await fileSystem.fileSizeInBytes(pathOf(traceFile));
        pendingText = "";
        pendingSize = 0;
      }
      pendingText += line;
      pendingSize += lineSize;
    }
    if (pendingText !== "") {
      await fileSystem.appendText(pathOf(traceFile), pendingText);
    }
  };

  const writeBufferedLines = async (): Promise<void> => {
    while (bufferedLines.length > 0) {
      const batch = bufferedLines;
      bufferedLines = [];
      if (traceDirectory === null) {
        reportFailureOnce(`trace sink could not resolve a trace directory: ${directoryProblem}`);
        continue;
      }
      try {
        for (const dayGroup of groupConsecutiveLinesByDay(batch)) {
          await appendLinesForDay(traceDirectory, dayGroup.utcDay, dayGroup.lines);
        }
      } catch (writeError) {
        // Start over on the next batch: the directory may be back, or the day may have changed.
        activeTraceFile = null;
        reportFailureOnce(
          `trace sink could not write to ${traceDirectory}: ${describeError(writeError)}`,
        );
      }
    }
  };

  const scheduleDrain = (): void => {
    if (drainInProgress !== null) {
      return;
    }
    drainInProgress = new Promise<void>((resolveTick) => {
      // Wait one turn of the event loop so lines written in the same tick share one append.
      setImmediate(resolveTick);
    })
      .then(writeBufferedLines)
      .finally(() => {
        drainInProgress = null;
        // Lines buffered after the last batch started but before this callback ran.
        if (bufferedLines.length > 0) {
          scheduleDrain();
        }
      });
  };

  const waitForEmptyBuffer = async (): Promise<void> => {
    while (drainInProgress !== null) {
      await drainInProgress;
    }
  };

  const writeRecord = (traceRecord: AgentStepTrace | RunSummaryTrace): void => {
    try {
      const line = `${JSON.stringify(traceRecord)}\n`;
      bufferedLines.push({ utcDay: utcDayOf(dependencies.currentTime()), line });
      scheduleDrain();
    } catch (serializeError) {
      reportFailureOnce(
        `trace sink could not serialize a record: ${describeError(serializeError)}`,
      );
    }
  };

  const flush = (timeoutInMilliseconds: number): Promise<void> => {
    try {
      if (drainInProgress === null) {
        return Promise.resolve();
      }
      return waitAtMost(usableTimeout(timeoutInMilliseconds), waitForEmptyBuffer());
    } catch {
      return Promise.resolve();
    }
  };

  return { traceDirectory, writeRecord, flush };
}
