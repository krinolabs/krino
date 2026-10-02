import { readdirSync, readFileSync } from "node:fs";
import nodePath from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SOURCE_DIRECTORY = nodePath.dirname(fileURLToPath(import.meta.url));

// Anything that reads the network, the clock, or a random source.
const FORBIDDEN_PATTERNS: Array<RegExp> = [
  /Math\.random/,
  /Date\.now/,
  /new Date\(/,
  /performance\.now/,
  /randomUUID|randomBytes|getRandomValues/,
  /\bfetch\(/,
  /from "node:(http|https|net|dgram|child_process)"/,
];

function listProductSourceFiles(directoryPath: string): Array<string> {
  return readdirSync(directoryPath, { withFileTypes: true }).flatMap((directoryEntry) => {
    const entryPath = nodePath.join(directoryPath, directoryEntry.name);
    if (directoryEntry.isDirectory()) {
      return listProductSourceFiles(entryPath);
    }
    const isProductSource =
      directoryEntry.name.endsWith(".ts") && !directoryEntry.name.endsWith(".test.ts");
    return isProductSource ? [entryPath] : [];
  });
}

describe("bench source", () => {
  const productSourceFiles = listProductSourceFiles(SOURCE_DIRECTORY);

  it("finds the source files to check", () => {
    expect(productSourceFiles.length).toBeGreaterThan(10);
  });

  it("uses no network, clock, or randomness", () => {
    for (const sourceFilePath of productSourceFiles) {
      const sourceText = readFileSync(sourceFilePath, "utf8");
      for (const forbiddenPattern of FORBIDDEN_PATTERNS) {
        expect(sourceText, `${sourceFilePath} matches ${forbiddenPattern}`).not.toMatch(
          forbiddenPattern,
        );
      }
    }
  });
});
