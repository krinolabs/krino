import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { readTarballEntries } from "./read-tarball.js";

// Builds a ustar archive by hand: one 512-byte header per entry, the content padded to 512 bytes,
// then two empty blocks.

const BLOCK_SIZE = 512;

type ArchiveEntry = { headerName: string; typeFlag: string; content: string };

function writeText(header: Buffer, offset: number, length: number, text: string): void {
  header.write(text.slice(0, length), offset, "utf8");
}

function headerBlock(archiveEntry: ArchiveEntry): Buffer {
  const header = Buffer.alloc(BLOCK_SIZE, 0);
  writeText(header, 0, 100, archiveEntry.headerName);
  writeText(header, 100, 8, "0000644\0");
  writeText(
    header,
    124,
    12,
    `${Buffer.byteLength(archiveEntry.content).toString(8).padStart(11, "0")}\0`,
  );
  writeText(header, 156, 1, archiveEntry.typeFlag);
  writeText(header, 257, 6, "ustar\0");
  writeText(header, 148, 8, "        ");
  let checksum = 0;
  for (const byte of header) {
    checksum += byte;
  }
  writeText(header, 148, 8, `${checksum.toString(8).padStart(6, "0")}\0 `);
  return header;
}

function contentBlocks(content: string): Buffer {
  const contentBytes = Buffer.from(content, "utf8");
  const paddedLength = Math.ceil(contentBytes.length / BLOCK_SIZE) * BLOCK_SIZE;
  return Buffer.concat([contentBytes, Buffer.alloc(paddedLength - contentBytes.length, 0)]);
}

function gzippedArchive(archiveEntries: ReadonlyArray<ArchiveEntry>): Buffer {
  return gzipSync(
    Buffer.concat([
      ...archiveEntries.flatMap((archiveEntry) => [
        headerBlock(archiveEntry),
        contentBlocks(archiveEntry.content),
      ]),
      Buffer.alloc(BLOCK_SIZE * 2, 0),
    ]),
  );
}

describe("readTarballEntries", () => {
  it("reads file paths and contents", () => {
    const entries = readTarballEntries(
      gzippedArchive([
        { headerName: "package/package.json", typeFlag: "0", content: '{"name":"demo"}' },
        { headerName: "package/dist/index.js", typeFlag: "0", content: "x".repeat(700) },
      ]),
    );
    expect(entries.map((entry) => entry.path)).toEqual([
      "package/package.json",
      "package/dist/index.js",
    ]);
    expect(entries[0]?.content.toString("utf8")).toBe('{"name":"demo"}');
    expect(entries[1]?.content.length).toBe(700);
  });

  it("skips folders and takes a long path from a pax header", () => {
    const longPath = `package/dist/${"nested/".repeat(20)}index.js`;
    const paxRecord = `path=${longPath}\n`;
    // A pax record is "<length> <key>=<value>\n", where length counts itself.
    const recordLength = paxRecord.length + 4;
    const entries = readTarballEntries(
      gzippedArchive([
        { headerName: "package/dist/", typeFlag: "5", content: "" },
        { headerName: "PaxHeader", typeFlag: "x", content: `${recordLength} ${paxRecord}` },
        { headerName: "package/dist/short.js", typeFlag: "0", content: "export {};" },
      ]),
    );
    expect(entries.map((entry) => entry.path)).toEqual([longPath]);
  });

  it("rejects a truncated archive", () => {
    const truncated = gzipSync(Buffer.alloc(100, 1));
    expect(() => readTarballEntries(truncated)).toThrow(/truncated/);
  });
});
