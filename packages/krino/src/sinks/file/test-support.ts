import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import nodePath from "node:path";
import type { AgentStepTrace, RunSummaryTrace } from "../../contracts/index.js";
import { TRACE_SCHEMA_VERSION } from "../../contracts/index.js";

// Helpers for the file sink tests. Not exported from the package.

export type TraceFileContents = {
  fileName: string;
  text: string;
};

export async function createTemporaryDirectory(): Promise<string> {
  return mkdtemp(nodePath.join(tmpdir(), "krino-file-sink-"));
}

export async function removeTemporaryDirectory(directoryPath: string): Promise<void> {
  await rm(directoryPath, { recursive: true, force: true, maxRetries: 5 });
}

/** Every file under the directory, recursively, sorted by relative path. */
export async function readEveryFile(directoryPath: string): Promise<Array<TraceFileContents>> {
  const relativePaths = await readdir(directoryPath, { recursive: true, withFileTypes: true });
  const files = await Promise.all(
    relativePaths
      .filter((directoryEntry) => directoryEntry.isFile())
      .map(async (directoryEntry) => {
        const filePath = nodePath.join(directoryEntry.parentPath, directoryEntry.name);
        return {
          fileName: nodePath.relative(directoryPath, filePath),
          text: await readFile(filePath, "utf8"),
        };
      }),
  );
  return files.sort((first, second) => first.fileName.localeCompare(second.fileName));
}

/** Parses every line; throws if any line is not one JSON object or a file does not end in `\n`. */
export function parseJsonLines(fileContents: TraceFileContents): Array<Record<string, unknown>> {
  if (fileContents.text !== "" && !fileContents.text.endsWith("\n")) {
    throw new Error(`${fileContents.fileName} does not end with a newline`);
  }
  return fileContents.text
    .split("\n")
    .slice(0, -1)
    .map((line, lineIndex) => {
      const parsed: unknown = JSON.parse(line);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error(`${fileContents.fileName}:${lineIndex + 1} is not a JSON object`);
      }
      return parsed as Record<string, unknown>;
    });
}

export function agentStepRecord(recordFields: Partial<AgentStepTrace> = {}): AgentStepTrace {
  return {
    traceSchemaVersion: TRACE_SCHEMA_VERSION,
    recordType: "agentStep",
    projectName: "file-sink-tests",
    runIdentifier: "run-1",
    stepNumber: 0,
    hostName: "ai-sdk",
    hostSdkVersion: "7.0.0-test",
    modelIdentifier: "claude-sonnet-5-5",
    availableToolNames: ["readFile", "search"],
    chosenToolNames: ["search"],
    tokenUsage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
    costInUsd: 0.0001,
    latencyInMilliseconds: 12,
    recordedAt: "2026-10-02T09:00:00.000Z",
    decisions: [],
    contentHash: null,
    ...recordFields,
  };
}

export function runSummaryRecord(recordFields: Partial<RunSummaryTrace> = {}): RunSummaryTrace {
  return {
    traceSchemaVersion: TRACE_SCHEMA_VERSION,
    recordType: "runSummary",
    projectName: "file-sink-tests",
    runIdentifier: "run-1",
    hostName: "ai-sdk",
    hostSdkVersion: "7.0.0-test",
    modelIdentifier: "claude-sonnet-5-5",
    totalTokenUsage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
    totalCostInUsd: 0.0001,
    stepCount: 1,
    usedToolNames: ["search"],
    toolSelectionAgreement: null,
    routingCounterfactualCostInUsd: null,
    runOutcome: null,
    recordedAt: "2026-10-02T09:00:01.000Z",
    ...recordFields,
  };
}
