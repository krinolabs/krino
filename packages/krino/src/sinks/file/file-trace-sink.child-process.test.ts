import { execFile } from "node:child_process";
import nodeModule from "node:module";
import nodePath from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS } from "../../contracts/index.js";
import {
  createTemporaryDirectory,
  parseJsonLines,
  readEveryFile,
  removeTemporaryDirectory,
} from "./test-support.js";

const runFile = promisify(execFile);
const sinkFolder = nodePath.dirname(fileURLToPath(import.meta.url));
const childScriptPath = nodePath.join(sinkFolder, "fixtures", "flush-then-exit-child.mjs");
const sinkModuleUrl = pathToFileURL(nodePath.join(sinkFolder, "file-trace-sink.ts")).href;

// The child loads TypeScript source directly: it needs type stripping (Node 22.18+) and
// synchronous module hooks (Node 22.15+). Every Node version in CI has both.
const canRunTypeScriptChild =
  typeof nodeModule.registerHooks === "function" && Boolean(process.features.typescript);

const CHILD_COUNT = 4;
const LINES_PER_CHILD = 500;

let temporaryDirectory = "";

beforeEach(async () => {
  temporaryDirectory = await createTemporaryDirectory();
});

afterEach(async () => {
  await removeTemporaryDirectory(temporaryDirectory);
});

describe.runIf(canRunTypeScriptChild)("a child process that exits right after flush", () => {
  it("leaves every line on disk, even with several processes writing at once", async () => {
    const childResults = await Promise.all(
      Array.from({ length: CHILD_COUNT }, (_, childNumber) =>
        runFile(process.execPath, [
          "--no-warnings",
          childScriptPath,
          sinkModuleUrl,
          temporaryDirectory,
          `child-${childNumber}`,
          String(LINES_PER_CHILD),
          String(DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS),
        ]),
      ),
    );
    for (const childResult of childResults) {
      expect(childResult.stderr).toBe("");
    }

    const lines = (await readEveryFile(temporaryDirectory)).flatMap(parseJsonLines);
    expect(lines).toHaveLength(CHILD_COUNT * LINES_PER_CHILD);
    for (let childNumber = 0; childNumber < CHILD_COUNT; childNumber += 1) {
      const stepNumbers = lines
        .filter((line) => line.runIdentifier === `child-${childNumber}`)
        .map((line) => line.stepNumber);
      expect(stepNumbers).toEqual(Array.from({ length: LINES_PER_CHILD }, (_, index) => index));
    }
  }, 30_000);
});
