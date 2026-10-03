import { describe, expect, inject, it } from "vitest";
import "./e2e-context.js";
import { readPackedPackage } from "./tarball/packed-package.js";

const e2eContext = inject("e2eContext");

describe.each(e2eContext.packedPackages)("packed $packageName", (packedPackage) => {
  it("rewrites every workspace: range (only pnpm pack does this)", async () => {
    const packedContents = await readPackedPackage(packedPackage.tarballPath);
    expect(packedContents.manifestText).not.toContain("workspace:");
  });

  it("holds only dist/, README.md, LICENSE and package.json", async () => {
    const packedContents = await readPackedPackage(packedPackage.tarballPath);
    expect(packedContents.unexpectedFilePaths).toEqual([]);
    expect(packedContents.filePaths).toEqual(
      expect.arrayContaining([
        "package.json",
        "README.md",
        "LICENSE",
        "dist/index.js",
        "dist/index.d.ts",
      ]),
    );
  });
});

describe("packed @krinolabs/cli", () => {
  it("depends on @krinolabs/krino with a caret range on the packed version", async () => {
    const krinoPackage = e2eContext.packedPackages.find(
      (packedPackage) => packedPackage.packageName === "@krinolabs/krino",
    );
    const cliPackage = e2eContext.packedPackages.find(
      (packedPackage) => packedPackage.packageName === "@krinolabs/cli",
    );
    if (krinoPackage === undefined || cliPackage === undefined) {
      throw new Error("The global setup did not pack @krinolabs/krino and @krinolabs/cli.");
    }
    const krinoManifest = (await readPackedPackage(krinoPackage.tarballPath)).manifest;
    const cliManifest = (await readPackedPackage(cliPackage.tarballPath)).manifest;
    const krinoRange = cliManifest.dependencies.get("@krinolabs/krino");
    expect(krinoRange?.startsWith("^")).toBe(true);
    expect(krinoRange).toBe(`^${krinoManifest.version}`);
  });
});
