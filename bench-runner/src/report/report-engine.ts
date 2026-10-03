import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import nodePath from "node:path";
import { promisify } from "node:util";

// The comparison's cache numbers come from krino's report engine: `krino report --json`, run from
// the workspace CLI, one setup project at a time. The JSON shape is stable within
// reportSchemaVersion 1 (packages/cli/src/report/README.md).

const runFile = promisify(execFile);

const SUPPORTED_REPORT_SCHEMA_VERSION = 1;
const REPORT_TIMEOUT_IN_MILLISECONDS = 120_000;
const REPORT_OUTPUT_LIMIT_IN_BYTES = 64 * 1024 * 1024;

export type ReportEngineSummary = {
  reportSchemaVersion: number;
  runCount: number;
  agentStepCount: number;
  /** Cache-read share of all input tokens, all runs. */
  cacheReadShare: number | null;
  cacheWriteShare: number | null;
  /** Runs with more than one step: the share that shows whether the cache holds. */
  multiStepRunCount: number;
  multiStepCacheReadShare: number | null;
  multiStepCacheWriteShare: number | null;
};

export type SetupReportResult =
  | { reportKind: "read"; summary: ReportEngineSummary }
  | { reportKind: "unavailable"; reason: string };

export type SetupReportRequest = {
  projectName: string;
  /** Records before this are left out (earlier bench runs in the same folder). */
  since: Date;
  traceDirectory: string;
  /** Default: the `krino` bin of the installed @krinolabs/cli. */
  cliEntryPath?: string;
};

/** An own property of external JSON, or `undefined`. Never reads the prototype chain. */
function ownValue(container: unknown, key: string): unknown {
  if (typeof container !== "object" || container === null || !Object.hasOwn(container, key)) {
    return undefined;
  }
  return (container as Record<string, unknown>)[key];
}

function ownPath(container: unknown, keys: ReadonlyArray<string>): unknown {
  return keys.reduce<unknown>((value, key) => ownValue(value, key), container);
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function shareOrNull(value: unknown): number | null | undefined {
  return value === null ? null : finiteNumber(value);
}

/** The fields the bench reads, or `null` when the report is not the expected shape. */
export function parseReportSummary(reportJson: unknown): ReportEngineSummary | null {
  const reportSchemaVersion = finiteNumber(ownValue(reportJson, "reportSchemaVersion"));
  const runCount = finiteNumber(ownPath(reportJson, ["records", "runCount"]));
  const agentStepCount = finiteNumber(ownPath(reportJson, ["records", "agentStepCount"]));
  const cacheReadShare = shareOrNull(
    ownPath(reportJson, ["cacheHealth", "overall", "cacheReadShare"]),
  );
  const cacheWriteShare = shareOrNull(
    ownPath(reportJson, ["cacheHealth", "overall", "cacheWriteShare"]),
  );
  const multiStepRunCount = finiteNumber(
    ownPath(reportJson, ["cacheHealth", "multiStepRuns", "runCount"]),
  );
  const multiStepCacheReadShare = shareOrNull(
    ownPath(reportJson, ["cacheHealth", "multiStepRuns", "overall", "cacheReadShare"]),
  );
  const multiStepCacheWriteShare = shareOrNull(
    ownPath(reportJson, ["cacheHealth", "multiStepRuns", "overall", "cacheWriteShare"]),
  );
  if (
    reportSchemaVersion !== SUPPORTED_REPORT_SCHEMA_VERSION ||
    runCount === undefined ||
    agentStepCount === undefined ||
    cacheReadShare === undefined ||
    cacheWriteShare === undefined ||
    multiStepRunCount === undefined ||
    multiStepCacheReadShare === undefined ||
    multiStepCacheWriteShare === undefined
  ) {
    return null;
  }
  return {
    reportSchemaVersion,
    runCount,
    agentStepCount,
    cacheReadShare,
    cacheWriteShare,
    multiStepRunCount,
    multiStepCacheReadShare,
    multiStepCacheWriteShare,
  };
}

/** The `krino` bin of the installed @krinolabs/cli, from its package.json. */
export function findCliEntryPath(): string {
  const manifestPath = createRequire(import.meta.url).resolve("@krinolabs/cli/package.json");
  const binPath = ownPath(JSON.parse(readFileSync(manifestPath, "utf8")), ["bin", "krino"]);
  if (typeof binPath !== "string") {
    throw new Error("@krinolabs/cli has no krino bin");
  }
  return nodePath.resolve(nodePath.dirname(manifestPath), binPath);
}

function describeError(caughtError: unknown): string {
  return caughtError instanceof Error
    ? (caughtError.message.split("\n")[0] ?? "")
    : String(caughtError);
}

/** Never throws: a report that cannot be read leaves the bench's own numbers intact. */
export async function readSetupReport(
  reportRequest: SetupReportRequest,
): Promise<SetupReportResult> {
  try {
    const cliEntryPath = reportRequest.cliEntryPath ?? findCliEntryPath();
    const { stdout } = await runFile(
      process.execPath,
      [
        cliEntryPath,
        "report",
        "--json",
        "--project",
        reportRequest.projectName,
        "--since",
        reportRequest.since.toISOString(),
        "--trace-dir",
        reportRequest.traceDirectory,
      ],
      {
        encoding: "utf8",
        env: { ...process.env, NO_COLOR: "1" },
        timeout: REPORT_TIMEOUT_IN_MILLISECONDS,
        maxBuffer: REPORT_OUTPUT_LIMIT_IN_BYTES,
      },
    );
    const summary = parseReportSummary(JSON.parse(stdout));
    return summary === null
      ? { reportKind: "unavailable", reason: "krino report --json returned an unexpected shape" }
      : { reportKind: "read", summary };
  } catch (reportError) {
    return {
      reportKind: "unavailable",
      reason: `krino report failed: ${describeError(reportError)}`,
    };
  }
}
