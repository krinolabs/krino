import { readdir, readFile } from "node:fs/promises";
import nodePath from "node:path";

/** The trace fields the e2e checks read. */
export type TraceRecordFields = {
  recordType: string;
  hostName: string;
  projectName: string;
  decisions?: Array<Record<string, unknown>>;
};

/** Every JSON line of every trace file in a folder (not recursive), file by file in name order. */
export async function readTraceRecords(traceDirectory: string): Promise<Array<TraceRecordFields>> {
  const fileNames = (await readdir(traceDirectory)).sort();
  const fileTexts = await Promise.all(
    fileNames.map((fileName) => readFile(nodePath.join(traceDirectory, fileName), "utf8")),
  );
  return fileTexts.flatMap((fileText) =>
    fileText
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line): TraceRecordFields => JSON.parse(line)),
  );
}
