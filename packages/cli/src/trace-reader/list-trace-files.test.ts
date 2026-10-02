import nodePath from "node:path";
import { describe, expect, it } from "vitest";
import { type ListDirectory, listTraceFiles } from "./list-trace-files.js";

function fakeDirectories(
  entriesByDirectory: Record<string, Array<{ entryName: string; isDirectory: boolean }>>,
): ListDirectory {
  const entryMap = new Map(Object.entries(entriesByDirectory));
  return async (directoryPath) => {
    const directoryEntries = entryMap.get(directoryPath);
    if (directoryEntries === undefined) {
      throw Object.assign(new Error(`ENOENT: ${directoryPath}`), { code: "ENOENT" });
    }
    return directoryEntries;
  };
}

const file = (entryName: string) => ({ entryName, isDirectory: false });
const folder = (entryName: string) => ({ entryName, isDirectory: true });

describe("listTraceFiles", () => {
  it("lists trace files of one project folder from the since day on, sorted", async () => {
    const projectFolder = nodePath.join("root", "shop");
    const traceFiles = await listTraceFiles(
      { locationKind: "projectFolder", directoryPath: projectFolder },
      "2026-09-30",
      fakeDirectories({
        [projectFolder]: [
          file("traces-2026-10-01.jsonl"),
          file("traces-2026-09-30.1.jsonl"),
          file("traces-2026-09-29.jsonl"),
          file("notes.txt"),
          folder("traces-2026-10-02.jsonl"),
        ],
      }),
    );
    expect(traceFiles).toEqual([
      nodePath.join(projectFolder, "traces-2026-09-30.1.jsonl"),
      nodePath.join(projectFolder, "traces-2026-10-01.jsonl"),
    ]);
  });

  it("reads every project folder under the traces root", async () => {
    const tracesRoot = "root";
    const traceFiles = await listTraceFiles(
      { locationKind: "tracesRoot", directoryPath: tracesRoot },
      "2026-09-01",
      fakeDirectories({
        [tracesRoot]: [folder("shop"), folder("blog"), file("traces-2026-10-01.jsonl")],
        [nodePath.join(tracesRoot, "shop")]: [file("traces-2026-10-01.jsonl")],
        [nodePath.join(tracesRoot, "blog")]: [file("traces-2026-09-15.jsonl")],
      }),
    );
    expect(traceFiles).toEqual([
      nodePath.join(tracesRoot, "blog", "traces-2026-09-15.jsonl"),
      nodePath.join(tracesRoot, "shop", "traces-2026-10-01.jsonl"),
    ]);
  });

  it("treats a missing folder as empty", async () => {
    await expect(
      listTraceFiles(
        { locationKind: "tracesRoot", directoryPath: "missing" },
        "2026-09-01",
        fakeDirectories({}),
      ),
    ).resolves.toEqual([]);
  });

  it("passes other listing errors on", async () => {
    const deniedListing: ListDirectory = async () => {
      throw Object.assign(new Error("EACCES"), { code: "EACCES" });
    };
    await expect(
      listTraceFiles(
        { locationKind: "projectFolder", directoryPath: "x" },
        "2026-09-01",
        deniedListing,
      ),
    ).rejects.toThrow("EACCES");
  });
});
