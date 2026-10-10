import { describe, expect, it } from "vitest";
import { nonBlankLines, readTraceAggregates } from "./read-trace-aggregates.js";

const filters = { projectName: null, sinceEpochMilliseconds: 0, tokensPerToolDefinition: 175 };

describe("nonBlankLines", () => {
  it("drops blank lines and keeps CRLF lines whole", () => {
    expect(nonBlankLines('{"a":1}\r\n\n  \n{"b":2}\n')).toEqual(['{"a":1}\r', '{"b":2}']);
  });
});

describe("readTraceAggregates", () => {
  it("reads the listed files through the injected reader, never by path in DuckDB", async () => {
    const readPaths: Array<string> = [];
    const traceAggregates = await readTraceAggregates(
      ["/any [folder]/traces-2026-10-01.jsonl"],
      filters,
      async (filePath) => {
        readPaths.push(filePath);
        return 'not json\n{"traceSchemaVersion":3}\r\n';
      },
    );
    expect(readPaths).toEqual(["/any [folder]/traces-2026-10-01.jsonl"]);
    expect(traceAggregates.lineCounts).toMatchObject({
      readLineCount: 2,
      invalidJsonLineCount: 1,
      unsupportedSchemaVersionLineCount: 1,
    });
  });

  it("sums cache usage per host for all runs and for multi-step runs only", async () => {
    const usage = (inputTokens: number, cacheReadTokens: number, cacheWriteTokens: number) => ({
      inputTokens,
      outputTokens: 1,
      cacheReadTokens,
      cacheWriteTokens,
    });
    const shared = {
      traceSchemaVersion: 1,
      projectName: "shop",
      hostSdkVersion: "1.0.0",
      modelIdentifier: "model",
      recordedAt: "2026-10-01T10:00:00.000Z",
    };
    const step = (
      hostName: string,
      runIdentifier: string,
      stepNumber: number,
      tokenUsage: ReturnType<typeof usage> | null,
    ) =>
      JSON.stringify({
        ...shared,
        recordType: "agentStep",
        hostName,
        runIdentifier,
        stepNumber,
        availableToolNames: [],
        chosenToolNames: [],
        tokenUsage,
        costInUsd: null,
        latencyInMilliseconds: null,
        decisions: [],
        contentHash: null,
      });
    const summary = (
      hostName: string,
      runIdentifier: string,
      stepCount: number,
      totalTokenUsage: ReturnType<typeof usage>,
    ) =>
      JSON.stringify({
        ...shared,
        recordType: "runSummary",
        hostName,
        runIdentifier,
        totalTokenUsage,
        totalCostInUsd: 0,
        stepCount,
        usedToolNames: [],
        toolSelectionAgreement: null,
      });
    const traceLines = [
      // Multi-step run with a summary: the summary counts, its steps do not.
      step("ai-sdk", "run-1", 0, usage(999, 999, 999)),
      summary("ai-sdk", "run-1", 2, usage(100, 300, 50)),
      // One-step run with a summary.
      summary("ai-sdk", "run-2", 1, usage(10, 20, 30)),
      // Two steps, no summary: multi-step, from the steps; a step without usage still counts.
      step("claude-agent-sdk", "run-3", 0, usage(1, 2, 3)),
      step("claude-agent-sdk", "run-3", 1, null),
      // One step, no summary.
      step("ai-sdk", "run-4", 0, usage(5, 5, 5)),
    ];

    const traceAggregates = await readTraceAggregates(
      ["traces-2026-10-01.jsonl"],
      filters,
      async () => traceLines.join("\n"),
    );

    expect(traceAggregates.cacheUsage).toEqual([
      {
        hostName: "ai-sdk",
        uncachedTokens: 115,
        cacheReadTokens: 325,
        cacheWriteTokens: 85,
        multiStepRunCount: 1,
        multiStepUncachedTokens: 100,
        multiStepCacheReadTokens: 300,
        multiStepCacheWriteTokens: 50,
      },
      {
        hostName: "claude-agent-sdk",
        uncachedTokens: 1,
        cacheReadTokens: 2,
        cacheWriteTokens: 3,
        multiStepRunCount: 1,
        multiStepUncachedTokens: 1,
        multiStepCacheReadTokens: 2,
        multiStepCacheWriteTokens: 3,
      },
    ]);
  });

  it("passes a file read error on", async () => {
    await expect(
      readTraceAggregates(["missing.jsonl"], filters, async () => {
        throw new Error("EACCES: permission denied");
      }),
    ).rejects.toThrow("EACCES");
  });
});
