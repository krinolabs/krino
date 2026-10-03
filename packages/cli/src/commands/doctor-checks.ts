import { randomUUID } from "node:crypto";
import { stat, unlink, writeFile } from "node:fs/promises";
import nodePath from "node:path";
import { type DoctorCheck, failCheck, passCheck, warnCheck } from "./doctor-check.js";
import type { TraceScanSummary } from "./doctor-trace-scan.js";
import { KRINO_CONFIG_FILE_NAME } from "./init-config.js";

export const MINIMUM_NODE_MAJOR_VERSION = 22;

/** `krino doctor` warns when more than this share of recent decisions were cut off. */
export const CUT_OFF_SHARE_MAXIMUM = 0.05;

/** `krino doctor` warns when multi-step runs read less than this share of input from the cache. */
export const CACHE_READ_SHARE_MINIMUM = 0.5;

const GATEWAY_KEY_VARIABLE = "AI_GATEWAY_API_KEY";

function percent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

function describeError(caughtError: unknown): string {
  return caughtError instanceof Error ? caughtError.message : String(caughtError);
}

export function checkNodeVersion(nodeVersion: string): DoctorCheck {
  const fixLine = `Install Node.js ${MINIMUM_NODE_MAJOR_VERSION} or newer: https://nodejs.org/`;
  const majorVersion = Number(/^v?(\d+)\./.exec(nodeVersion)?.[1]);
  if (!Number.isInteger(majorVersion)) {
    return failCheck("Node.js", `could not read the version "${nodeVersion}"`, fixLine);
  }
  return majorVersion >= MINIMUM_NODE_MAJOR_VERSION
    ? passCheck("Node.js", nodeVersion)
    : failCheck("Node.js", `${nodeVersion} is older than ${MINIMUM_NODE_MAJOR_VERSION}`, fixLine);
}

export type ConfigLookup =
  | { configKind: "missing" }
  | { configKind: "invalid"; configPath: string; message: string }
  | {
      configKind: "valid";
      configPath: string;
      projectName: string;
      /** As written in the file; `null` when left out. */
      traceDirectory: string | null;
    };

export function checkConfigFile(configLookup: ConfigLookup): DoctorCheck {
  if (configLookup.configKind === "missing") {
    return warnCheck(
      KRINO_CONFIG_FILE_NAME,
      "not found in this folder or its parents",
      "Run `krino init` in your project's folder",
    );
  }
  if (configLookup.configKind === "invalid") {
    return failCheck(
      KRINO_CONFIG_FILE_NAME,
      `${configLookup.configPath}: ${configLookup.message}`,
      `Fix ${configLookup.configPath}, or rewrite it with \`krino init --force\``,
    );
  }
  return passCheck(
    KRINO_CONFIG_FILE_NAME,
    `${configLookup.configPath} (project "${configLookup.projectName}")`,
  );
}

/** Prints only "present" or "missing", never the value. */
export function checkGatewayKey(
  environment: Readonly<Record<string, string | undefined>>,
): DoctorCheck {
  const keyValue = environment[GATEWAY_KEY_VARIABLE];
  return keyValue !== undefined && keyValue.trim() !== ""
    ? passCheck(GATEWAY_KEY_VARIABLE, "present")
    : warnCheck(
        GATEWAY_KEY_VARIABLE,
        "missing",
        `Set ${GATEWAY_KEY_VARIABLE} to use the Jev decision provider (the fake provider works without it)`,
      );
}

export function checkFakeProvider(traceSummary: TraceScanSummary): DoctorCheck {
  const checkName = "Decision provider";
  if (traceSummary.decisionCount === 0) {
    return passCheck(checkName, "no recent decisions to check");
  }
  if (traceSummary.fakeProviderDecisionCount === 0) {
    return passCheck(checkName, "no recent decisions came from the fake provider");
  }
  return warnCheck(
    checkName,
    `${traceSummary.fakeProviderDecisionCount} of ${traceSummary.decisionCount} recent decisions came from the fake provider`,
    "Pass decisionProvider: createJevAiGatewayProvider() (from @krinolabs/krino/providers/jev) to createKrino(), and set AI_GATEWAY_API_KEY",
  );
}

export type RecentTraceRead =
  | {
      readKind: "read";
      traceDirectory: string;
      traceFileCount: number;
      traceSummary: TraceScanSummary;
    }
  | { readKind: "readError"; traceDirectory: string; message: string };

export function checkRecentTraces(recentTraceRead: RecentTraceRead): DoctorCheck {
  const checkName = "Recent traces";
  if (recentTraceRead.readKind === "readError") {
    return failCheck(
      checkName,
      `could not read ${recentTraceRead.traceDirectory}: ${recentTraceRead.message}`,
      "Check that you can read the trace folder, or point at another one with --trace-dir",
    );
  }
  const { lineCounts, runCount, agentStepCount } = recentTraceRead.traceSummary;
  if (recentTraceRead.traceFileCount === 0 || lineCounts.readLineCount === 0) {
    return warnCheck(
      checkName,
      `no traces from the last 7 days in ${recentTraceRead.traceDirectory}`,
      "Run your agent once with krino wired in (`krino init` prints the snippet)",
    );
  }
  if (lineCounts.validLineCount === 0) {
    return failCheck(
      checkName,
      `none of ${lineCounts.readLineCount} lines in ${recentTraceRead.traceDirectory} parse as krino traces`,
      "Make sure only krino writes to this folder and that @krinolabs/krino is up to date",
    );
  }
  const skippedLineCount = lineCounts.readLineCount - lineCounts.validLineCount;
  if (skippedLineCount > 0) {
    return warnCheck(
      checkName,
      `${skippedLineCount} of ${lineCounts.readLineCount} lines skipped (${lineCounts.invalidJsonLineCount} invalid JSON, ${lineCounts.unsupportedSchemaVersionLineCount} unsupported schema version, ${lineCounts.invalidShapeLineCount} bad shape)`,
      "Make sure only krino writes to this folder; `krino report` skips the same lines",
    );
  }
  return passCheck(
    checkName,
    `${lineCounts.readLineCount} lines in ${recentTraceRead.traceFileCount} files: ${runCount} runs, ${agentStepCount} steps`,
  );
}

export function checkCutOffRate(traceSummary: TraceScanSummary): DoctorCheck {
  const checkName = "Cut-offs";
  if (traceSummary.decisionCount === 0) {
    return passCheck(checkName, "no recent decisions to check");
  }
  const cutOffShare = traceSummary.cutOffDecisionCount / traceSummary.decisionCount;
  const detail = `${traceSummary.cutOffDecisionCount} of ${traceSummary.decisionCount} recent decisions cut off (${percent(cutOffShare)})`;
  return cutOffShare > CUT_OFF_SHARE_MAXIMUM
    ? warnCheck(
        checkName,
        `${detail}; above ${percent(CUT_OFF_SHARE_MAXIMUM)}`,
        "Let krino finish before the process exits: `await krino.flushAll(2000)` (observeKrinoMessages already waits by default)",
      )
    : passCheck(checkName, detail);
}

export function checkCacheHealth(traceSummary: TraceScanSummary): DoctorCheck {
  const checkName = "Cache health";
  const { runCount, uncachedTokens, cacheReadTokens, cacheWriteTokens } =
    traceSummary.multiStepRunUsage;
  const totalInputTokens = uncachedTokens + cacheReadTokens + cacheWriteTokens;
  if (runCount === 0 || totalInputTokens === 0) {
    return passCheck(checkName, "no multi-step runs with token usage to check");
  }
  const cacheReadShare = cacheReadTokens / totalInputTokens;
  const detail = `${percent(cacheReadShare)} of input tokens read from cache over ${runCount} multi-step runs`;
  return cacheReadShare < CACHE_READ_SHARE_MINIMUM
    ? warnCheck(
        checkName,
        `${detail}; below ${percent(CACHE_READ_SHARE_MINIMUM)}`,
        "Keep the system prompt and tool list the same on every step so the prompt cache can hit; `krino report` shows the shares per host",
      )
    : passCheck(checkName, detail);
}

/** What the writable check touches on disk. Injectable for tests. */
export type ProbeFileSystem = {
  pathKind: (targetPath: string) => Promise<"directory" | "file" | "missing">;
  /** Creates the file; fails if it exists. */
  writeProbe: (probePath: string) => Promise<void>;
  removeProbe: (probePath: string) => Promise<void>;
};

export const probeFileSystemFromDisk: ProbeFileSystem = {
  pathKind: async (targetPath) => {
    try {
      return (await stat(targetPath)).isDirectory() ? "directory" : "file";
    } catch {
      return "missing";
    }
  },
  writeProbe: (probePath) => writeFile(probePath, "", { flag: "wx" }),
  removeProbe: (probePath) => unlink(probePath),
};

/**
 * Writes and deletes a probe file in the trace folder, or in its nearest existing parent when the
 * folder does not exist yet (the sink creates it). A real write: `fs.access(W_OK)` is unreliable
 * on Windows. Never creates the folder.
 */
export async function checkTraceFolderWritable(
  traceDirectory: string,
  probeFileSystem: ProbeFileSystem,
): Promise<DoctorCheck> {
  const checkName = "Trace folder";
  const fixLine = `Make ${traceDirectory} writable, or choose another folder with --trace-dir or KRINO_TRACE_DIRECTORY`;
  let existingFolder = traceDirectory;
  for (;;) {
    const pathKind = await probeFileSystem.pathKind(existingFolder);
    if (pathKind === "file") {
      return failCheck(checkName, `${existingFolder} is a file, not a folder`, fixLine);
    }
    if (pathKind === "directory") {
      break;
    }
    const parentFolder = nodePath.dirname(existingFolder);
    if (parentFolder === existingFolder) {
      return failCheck(checkName, `no part of ${traceDirectory} exists`, fixLine);
    }
    existingFolder = parentFolder;
  }
  const probePath = nodePath.join(existingFolder, `.krino-doctor-${randomUUID()}.tmp`);
  try {
    await probeFileSystem.writeProbe(probePath);
  } catch (writeError) {
    return failCheck(
      checkName,
      `cannot write to ${existingFolder}: ${describeError(writeError)}`,
      fixLine,
    );
  }
  try {
    await probeFileSystem.removeProbe(probePath);
  } catch {
    // The write worked, which is what this check asks; a leftover empty file is harmless.
  }
  return existingFolder === traceDirectory
    ? passCheck(checkName, `${traceDirectory} is writable`)
    : passCheck(
        checkName,
        `${traceDirectory} does not exist yet; ${existingFolder} is writable, so the sink can create it`,
      );
}
