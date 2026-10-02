import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import nodePath from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createKrino } from "./index.js";

// Guards tooling/vitest/trace-isolation.ts: a test that uses the default file sink must never
// write under the real home folder.

const REAL_KRINO_HOME = nodePath.join(homedir(), ".krino");
const FLUSH_TIMEOUT_IN_MILLISECONDS = 5_000;

function isMissingPathError(caughtError: unknown): boolean {
  return caughtError instanceof Error && "code" in caughtError && caughtError.code === "ENOENT";
}

/** One line per file and folder under the directory, with size and change time; empty if missing. */
async function snapshotDirectory(directoryPath: string): Promise<Array<string>> {
  try {
    const directoryEntries = await readdir(directoryPath, { recursive: true, withFileTypes: true });
    const entryLines = await Promise.all(
      directoryEntries.map(async (directoryEntry) => {
        const entryPath = nodePath.join(directoryEntry.parentPath, directoryEntry.name);
        const entryStats = await stat(entryPath);
        return `${entryPath} ${entryStats.size} ${entryStats.mtimeMs}`;
      }),
    );
    return entryLines.sort();
  } catch (caughtError) {
    if (isMissingPathError(caughtError)) {
      return [];
    }
    throw caughtError;
  }
}

beforeEach(() => {
  // The default fake provider warns that it is in use.
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("trace isolation in tests", () => {
  it("createKrino with only the required config writes traces to the test folder, not ~/.krino", async () => {
    const isolatedTraceDirectory = process.env.KRINO_TRACE_DIRECTORY;
    expect(isolatedTraceDirectory).toBeTruthy();
    expect(nodePath.resolve(isolatedTraceDirectory ?? "")).not.toContain(REAL_KRINO_HOME);
    const homeBefore = await snapshotDirectory(REAL_KRINO_HOME);

    const krinoRuntime = createKrino({ projectName: "trace-isolation-test", decisionModes: {} });
    const runHandle = krinoRuntime.startRun({
      hostName: "ai-sdk",
      hostSdkVersion: "7.0.0-test",
      capabilities: {
        supportedDecisions: ["toolSelection", "riskGate"],
        toolSelectionTiming: "perStep",
        reportsPerStepUsage: true,
      },
    });
    runHandle.recordStep({
      runIdentifier: runHandle.runIdentifier,
      stepNumber: 0,
      hostName: "ai-sdk",
      hostSdkVersion: "7.0.0-test",
      modelIdentifier: "claude-sonnet-5-5",
      availableToolNames: ["lookUpOrder"],
      chosenToolNames: ["lookUpOrder"],
      tokenUsage: { inputTokens: 100, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 },
      costInUsd: null,
      latencyInMilliseconds: 50,
      decisions: [],
      contentHash: null,
    });
    await krinoRuntime.flushAll(FLUSH_TIMEOUT_IN_MILLISECONDS);

    expect(await snapshotDirectory(REAL_KRINO_HOME)).toEqual(homeBefore);
    // The step really was written somewhere, so the check above is not vacuous.
    expect(await snapshotDirectory(isolatedTraceDirectory ?? "")).not.toEqual([]);
  });
});
