import nodePath from "node:path";
import { describe, expect, inject, it } from "vitest";
import "./e2e-context.js";
import { consumerEnvironment } from "./consumer/consumer-commands.js";
import { runCommand } from "./setup/run-command.js";
import { readPackedPackage } from "./tarball/packed-package.js";
import {
  findUncoveredExports,
  publicEntrySpecifiers,
  readEntryExports,
} from "./types/public-exports.js";
import { classifyTypeDiagnostics } from "./types/type-diagnostics.js";

// The published type declarations, as a consumer with a strict tsconfig sees them.
// `consumer/src/public-api.ts` uses every public export; this test fails when an export is added
// without being covered there, and when the consumer project does not compile.

const e2eContext = inject("e2eContext");
const consumer = e2eContext.consumerWithHostSdks;
const PUBLIC_API_FILE = "src/public-api.ts";

describe("published types in a strict consumer project", () => {
  it("compile with the consumer's strict tsconfig (tsc from the consumer's node_modules)", async () => {
    const typeCheck = await runCommand("pnpm", ["exec", "tsc", "-p", "tsconfig.json"], {
      workingDirectory: consumer.directory,
      environment: consumerEnvironment(),
    });
    expect(typeCheck.stdout + typeCheck.stderr).toBe("");
    expect(typeCheck.exitCode).toBe(0);
  });

  it("have no errors in krino's own .d.ts files when libraries are checked too", async () => {
    const libraryCheck = await runCommand(
      "pnpm",
      ["exec", "tsc", "-p", "tsconfig.declarations.json", "--listFiles"],
      { workingDirectory: consumer.directory, environment: consumerEnvironment() },
    );
    const outputLines = (libraryCheck.stdout + libraryCheck.stderr)
      .split(/\r?\n/)
      .map((outputLine) => outputLine.replaceAll("\\", "/"));
    const krinoDeclarationFiles = outputLines.filter((outputLine) =>
      /\/@krinolabs\/krino\/dist\/.*\.d\.ts$/.test(outputLine),
    );
    // The check really read the published declarations of every entry point.
    for (const entryDeclaration of [
      "dist/index.d.ts",
      "dist/adapters/ai-sdk/index.d.ts",
      "dist/adapters/claude-agent-sdk/index.d.ts",
      "dist/providers/jev-ai-gateway/index.d.ts",
    ]) {
      expect(
        krinoDeclarationFiles.some((filePath) => filePath.endsWith(`/${entryDeclaration}`)),
        entryDeclaration,
      ).toBe(true);
    }
    const classified = classifyTypeDiagnostics(outputLines.join("\n"));
    // Third-party declarations report errors of their own under this strict config; for
    // information only.
    console.log(
      `e2e: library check: ${classified.thirdPartyDiagnosticCount} third-party diagnostics (not failing)`,
    );
    expect(classified.failingDiagnostics).toEqual([]);
  });

  it("still fails on a deliberate type error in the consumer's own file", async () => {
    const fixtureCheck = await runCommand(
      "pnpm",
      ["exec", "tsc", "-p", "tsconfig.type-error-fixture.json"],
      { workingDirectory: consumer.directory, environment: consumerEnvironment() },
    );
    const classified = classifyTypeDiagnostics(fixtureCheck.stdout + fixtureCheck.stderr);
    expect(fixtureCheck.exitCode).not.toBe(0);
    expect(classified.failingDiagnostics).toEqual([
      expect.stringMatching(
        /^type-error-fixture[\\/]deliberate-type-error\.ts\(\d+,\d+\): error TS2322/,
      ),
    ]);
  });

  it("public-api.ts imports every export of every @krinolabs/krino entry point", async () => {
    const krinoPackage = e2eContext.packedPackages.find(
      (packedPackage) => packedPackage.packageName === "@krinolabs/krino",
    );
    if (krinoPackage === undefined) {
      throw new Error("The global setup did not pack @krinolabs/krino.");
    }
    const packedManifest = (await readPackedPackage(krinoPackage.tarballPath)).manifest;
    const entrySpecifiers = publicEntrySpecifiers("@krinolabs/krino", packedManifest.exportKeys);
    // Imports of other packages (ai, the Agent SDK) are not checked for coverage.
    const krinoEntryExports = readEntryExports(
      nodePath.join(consumer.directory, PUBLIC_API_FILE),
    ).filter((entry) => entrySpecifiers.includes(entry.specifier));
    expect(krinoEntryExports.map((entry) => entry.specifier).sort()).toEqual(
      [...entrySpecifiers].sort(),
    );
    for (const entry of krinoEntryExports) {
      expect(entry.exportedNames.length, entry.specifier).toBeGreaterThan(0);
    }
    expect(findUncoveredExports(krinoEntryExports)).toEqual([]);
  });
});
