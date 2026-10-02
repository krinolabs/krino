import { readdir } from "node:fs/promises";
import nodePath from "node:path";
import { type TraceLocation, traceFileMayHoldRecordsSince } from "./trace-directory.js";

/** Directory listing the reader needs. Injectable for tests. */
export type ListDirectory = (
  directoryPath: string,
) => Promise<Array<{ entryName: string; isDirectory: boolean }>>;

export const listDirectoryFromDisk: ListDirectory = async (directoryPath) => {
  const directoryEntries = await readdir(directoryPath, { withFileTypes: true });
  return directoryEntries.map((directoryEntry) => ({
    entryName: directoryEntry.name,
    isDirectory: directoryEntry.isDirectory(),
  }));
};

function isMissingDirectoryError(listError: unknown): boolean {
  return (
    typeof listError === "object" &&
    listError !== null &&
    "code" in listError &&
    (listError.code === "ENOENT" || listError.code === "ENOTDIR")
  );
}

async function listOrEmpty(
  listDirectory: ListDirectory,
  directoryPath: string,
): Promise<Array<{ entryName: string; isDirectory: boolean }>> {
  try {
    return await listDirectory(directoryPath);
  } catch (listError) {
    if (isMissingDirectoryError(listError)) {
      return [];
    }
    throw listError;
  }
}

async function traceFilesInFolder(
  listDirectory: ListDirectory,
  folderPath: string,
  sinceUtcDay: string,
): Promise<Array<string>> {
  const folderEntries = await listOrEmpty(listDirectory, folderPath);
  return folderEntries
    .filter(
      (folderEntry) =>
        !folderEntry.isDirectory &&
        traceFileMayHoldRecordsSince(folderEntry.entryName, sinceUtcDay),
    )
    .map((folderEntry) => nodePath.join(folderPath, folderEntry.entryName));
}

/**
 * Absolute paths of the trace files that can hold records from `sinceUtcDay` on, sorted.
 * A missing folder yields no files.
 */
export async function listTraceFiles(
  traceLocation: TraceLocation,
  sinceUtcDay: string,
  listDirectory: ListDirectory = listDirectoryFromDisk,
): Promise<Array<string>> {
  if (traceLocation.locationKind === "projectFolder") {
    const traceFiles = await traceFilesInFolder(
      listDirectory,
      traceLocation.directoryPath,
      sinceUtcDay,
    );
    return traceFiles.sort();
  }
  const rootEntries = await listOrEmpty(listDirectory, traceLocation.directoryPath);
  const projectFolders = rootEntries
    .filter((rootEntry) => rootEntry.isDirectory)
    .map((rootEntry) => nodePath.join(traceLocation.directoryPath, rootEntry.entryName));
  const traceFilesPerFolder = await Promise.all(
    projectFolders.map((projectFolder) =>
      traceFilesInFolder(listDirectory, projectFolder, sinceUtcDay),
    ),
  );
  return traceFilesPerFolder.flat().sort();
}
