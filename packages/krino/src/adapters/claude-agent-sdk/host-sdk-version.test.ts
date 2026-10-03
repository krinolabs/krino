import nodePath from "node:path";
import { describe, expect, it } from "vitest";
import { type PackageFileAccess, readHostSdkVersion } from "./host-sdk-version.js";

const ENTRY_FILE = nodePath.join("/modules", "@anthropic-ai", "claude-agent-sdk", "sdk.mjs");

function fileAccess(filesByPath: Map<string, string>): PackageFileAccess {
  return {
    resolvePackageEntry: () => ENTRY_FILE,
    readTextFile: async (filePath) => {
      const fileText = filesByPath.get(filePath);
      if (fileText === undefined) {
        throw new Error(`no file ${filePath}`);
      }
      return fileText;
    },
  };
}

describe("readHostSdkVersion", () => {
  it("reads the installed SDK (the pinned devDependency)", async () => {
    await expect(readHostSdkVersion()).resolves.toBe("0.3.286");
  });

  it("reads the package.json next to the entry file", async () => {
    const packageJsonPath = nodePath.join(nodePath.dirname(ENTRY_FILE), "package.json");
    const filesByPath = new Map([
      [
        packageJsonPath,
        JSON.stringify({ name: "@anthropic-ai/claude-agent-sdk", version: "9.9.9" }),
      ],
    ]);
    await expect(readHostSdkVersion(fileAccess(filesByPath))).resolves.toBe("9.9.9");
  });

  it("is unknown when the SDK is not installed", async () => {
    await expect(
      readHostSdkVersion({
        resolvePackageEntry: () => {
          throw new Error("Cannot find module");
        },
        readTextFile: async () => "",
      }),
    ).resolves.toBe("unknown");
  });

  it("is unknown when no package.json names the SDK", async () => {
    const packageJsonPath = nodePath.join(nodePath.dirname(ENTRY_FILE), "package.json");
    const filesByPath = new Map([
      [packageJsonPath, JSON.stringify({ name: "something-else", version: "1.0.0" })],
    ]);
    await expect(readHostSdkVersion(fileAccess(filesByPath))).resolves.toBe("unknown");
    await expect(
      readHostSdkVersion(fileAccess(new Map([[packageJsonPath, "not json"]]))),
    ).resolves.toBe("unknown");
    await expect(
      readHostSdkVersion(fileAccess(new Map([[packageJsonPath, "null"]]))),
    ).resolves.toBe("unknown");
  });
});
