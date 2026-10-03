import { gunzipSync } from "node:zlib";

// A small reader for the .tgz files `pnpm pack` writes (ustar, with pax headers for long paths).
// Enough to list files and read package.json; no extraction to disk.

const BLOCK_SIZE = 512;

export type TarballEntry = {
  /** The path inside the archive, for example `package/dist/index.js`. */
  path: string;
  content: Buffer;
};

function readText(block: Buffer, offset: number, length: number): string {
  const field = block.subarray(offset, offset + length);
  const endIndex = field.indexOf(0);
  return field.subarray(0, endIndex === -1 ? field.length : endIndex).toString("utf8");
}

function readOctal(block: Buffer, offset: number, length: number): number {
  const fieldText = readText(block, offset, length).trim();
  return fieldText === "" ? 0 : Number.parseInt(fieldText, 8);
}

/** The `path` record of a pax extended header, or `null`. Records are `<length> key=value\n`. */
function paxPath(paxContent: Buffer): string | null {
  for (const record of paxContent.toString("utf8").split("\n")) {
    const keyValue = record.slice(record.indexOf(" ") + 1);
    if (keyValue.startsWith("path=")) {
      return keyValue.slice("path=".length);
    }
  }
  return null;
}

/** Every regular file in a gzipped tarball, in archive order. */
export function readTarballEntries(gzippedBytes: Buffer): Array<TarballEntry> {
  const archive = gunzipSync(gzippedBytes);
  const entries: Array<TarballEntry> = [];
  let pathFromPaxHeader: string | null = null;
  let offset = 0;
  while (offset + BLOCK_SIZE <= archive.length) {
    const header = archive.subarray(offset, offset + BLOCK_SIZE);
    if (header.every((byte) => byte === 0)) {
      return entries;
    }
    const contentSize = readOctal(header, 124, 12);
    const contentStart = offset + BLOCK_SIZE;
    const contentEnd = contentStart + contentSize;
    if (contentEnd > archive.length) {
      throw new Error("The tarball is truncated: an entry runs past the end of the archive.");
    }
    const content = archive.subarray(contentStart, contentEnd);
    const typeFlag = readText(header, 156, 1);
    if (typeFlag === "x") {
      pathFromPaxHeader = paxPath(content);
    } else if (typeFlag === "0" || typeFlag === "") {
      const prefix = readText(header, 345, 155);
      const headerName = readText(header, 0, 100);
      const headerPath = prefix === "" ? headerName : `${prefix}/${headerName}`;
      entries.push({ path: pathFromPaxHeader ?? headerPath, content: Buffer.from(content) });
      pathFromPaxHeader = null;
    } else {
      // Folders, links and global pax headers carry no file.
      pathFromPaxHeader = null;
    }
    offset = contentStart + Math.ceil(contentSize / BLOCK_SIZE) * BLOCK_SIZE;
  }
  throw new Error("The tarball is truncated: it has no end-of-archive blocks.");
}
