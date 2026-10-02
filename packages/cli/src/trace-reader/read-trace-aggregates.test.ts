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
        return 'not json\n{"traceSchemaVersion":2}\r\n';
      },
    );
    expect(readPaths).toEqual(["/any [folder]/traces-2026-10-01.jsonl"]);
    expect(traceAggregates.lineCounts).toMatchObject({
      readLineCount: 2,
      invalidJsonLineCount: 1,
      unsupportedSchemaVersionLineCount: 1,
    });
  });

  it("passes a file read error on", async () => {
    await expect(
      readTraceAggregates(["missing.jsonl"], filters, async () => {
        throw new Error("EACCES: permission denied");
      }),
    ).rejects.toThrow("EACCES");
  });
});
