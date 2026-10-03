import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import nodePath from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AI_SDK_TESTED_RANGE,
  CLAUDE_AGENT_SDK_PEER_RANGE,
  CLAUDE_AGENT_SDK_TESTED_VERSION,
  checkHostSdkVersions,
  findInstalledVersion,
  parseVersion,
} from "./doctor-versions.js";

describe("parseVersion", () => {
  it("reads major, minor, patch and a prerelease tag", () => {
    expect(parseVersion("7.0.126")).toEqual({
      major: 7,
      minor: 0,
      patch: 126,
      prerelease: null,
    });
    expect(parseVersion("8.0.0-beta.2+build.5")).toEqual({
      major: 8,
      minor: 0,
      patch: 0,
      prerelease: "beta.2",
    });
  });

  it("rejects anything else", () => {
    for (const versionText of ["", "7", "7.0", "v7.0.1", "7.0.x", "latest", "07.0.1"]) {
      expect(parseVersion(versionText)).toBeNull();
    }
  });
});

describe("tested versions", () => {
  it("match the peer range and dev version in @krinolabs/krino's package.json", async () => {
    const krinoManifestPath = createRequire(import.meta.url).resolve(
      "@krinolabs/krino/package.json",
    );
    const krinoManifest = JSON.parse(await readFile(krinoManifestPath, "utf8"));
    expect(AI_SDK_TESTED_RANGE.rangeText).toBe(krinoManifest.peerDependencies.ai);
    expect(CLAUDE_AGENT_SDK_PEER_RANGE.rangeText).toBe(
      krinoManifest.peerDependencies["@anthropic-ai/claude-agent-sdk"],
    );
    expect(CLAUDE_AGENT_SDK_TESTED_VERSION).toBe(
      krinoManifest.devDependencies["@anthropic-ai/claude-agent-sdk"],
    );
  });
});

describe("checkHostSdkVersions", () => {
  const notInstalled = { installed: false, version: null };

  function aiCheck(version: string | null) {
    const [hostCheck] = checkHostSdkVersions({
      ai: { installed: true, version },
      claudeAgentSdk: notInstalled,
    });
    return hostCheck;
  }

  function claudeCheck(version: string | null) {
    const [hostCheck] = checkHostSdkVersions({
      ai: notInstalled,
      claudeAgentSdk: { installed: true, version },
    });
    return hostCheck;
  }

  it.each([
    ["7.0.111", "pass"],
    ["7.0.126", "pass"],
    ["7.9.0", "pass"],
    ["7.0.110", "fail"],
    ["6.9.9", "fail"],
    ["8.0.0", "fail"],
    ["8.0.0-beta.1", "fail"],
    ["7.1.0-canary.3", "warn"],
    ["not-a-version", "warn"],
  ])("ai %s → %s", (version, expectedStatus) => {
    expect(aiCheck(version)?.checkStatus).toBe(expectedStatus);
  });

  it("names the tested range and a fix for ai outside it", () => {
    const hostCheck = aiCheck("6.0.0");
    expect(hostCheck?.detail).toContain("6.0.0");
    expect(hostCheck?.detail).toContain(">=7.0.111 <8");
    expect(hostCheck?.fixLine).toContain('npm install "ai@>=7.0.111 <8"');
  });

  it.each([
    ["0.3.286", "pass"],
    ["0.3.287", "warn"],
    ["0.3.0", "warn"],
    ["0.4.0", "warn"],
    ["1.0.0", "warn"],
    ["0.3.286-rc.1", "warn"],
    ["0.2.99", "fail"],
    ["0.3.0-alpha", "fail"],
    ["garbage", "warn"],
  ])("claude-agent-sdk %s → %s", (version, expectedStatus) => {
    expect(claudeCheck(version)?.checkStatus).toBe(expectedStatus);
  });

  it("points at the tested Claude Agent SDK version", () => {
    expect(claudeCheck("0.3.300")?.fixLine).toContain(
      "npm install @anthropic-ai/claude-agent-sdk@0.3.286",
    );
  });

  it("checks both hosts when both are installed", () => {
    const hostChecks = checkHostSdkVersions({
      ai: { installed: true, version: "7.0.126" },
      claudeAgentSdk: { installed: true, version: "0.3.286" },
    });
    expect(hostChecks.map((hostCheck) => hostCheck.checkName)).toEqual([
      "ai",
      "@anthropic-ai/claude-agent-sdk",
    ]);
  });

  it("warns when no host SDK is installed", () => {
    const hostChecks = checkHostSdkVersions({ ai: notInstalled, claudeAgentSdk: notInstalled });
    expect(hostChecks).toHaveLength(1);
    expect(hostChecks[0]?.checkStatus).toBe("warn");
    expect(hostChecks[0]?.fixLine).toContain("npm install");
  });
});

describe("findInstalledVersion", () => {
  let rootFolder = "";

  beforeEach(async () => {
    rootFolder = await mkdtemp(nodePath.join(tmpdir(), "krino-doctor-versions-"));
  });

  afterEach(async () => {
    await rm(rootFolder, { recursive: true, force: true, maxRetries: 5 });
  });

  async function installPackage(
    folder: string,
    packageName: string,
    manifestText: string,
  ): Promise<void> {
    const packageFolder = nodePath.join(folder, "node_modules", ...packageName.split("/"));
    await mkdir(packageFolder, { recursive: true });
    await writeFile(nodePath.join(packageFolder, "package.json"), manifestText);
  }

  it("finds a scoped package in the start folder", async () => {
    await installPackage(
      rootFolder,
      "@anthropic-ai/claude-agent-sdk",
      JSON.stringify({ version: "0.3.286" }),
    );
    expect(await findInstalledVersion(rootFolder, "@anthropic-ai/claude-agent-sdk")).toEqual({
      installed: true,
      version: "0.3.286",
    });
  });

  it("walks up to a parent folder's node_modules, through folder names with spaces", async () => {
    const nestedFolder = nodePath.join(rootFolder, "my apps", "shop agent");
    await mkdir(nestedFolder, { recursive: true });
    await installPackage(rootFolder, "ai", JSON.stringify({ version: "7.0.126" }));
    expect(await findInstalledVersion(nestedFolder, "ai")).toEqual({
      installed: true,
      version: "7.0.126",
    });
  });

  it("prefers the nearest install", async () => {
    const nestedFolder = nodePath.join(rootFolder, "app");
    await installPackage(rootFolder, "ai", JSON.stringify({ version: "6.0.0" }));
    await installPackage(nestedFolder, "ai", JSON.stringify({ version: "7.0.126" }));
    expect((await findInstalledVersion(nestedFolder, "ai")).version).toBe("7.0.126");
  });

  it("reports an install without a readable version", async () => {
    await installPackage(rootFolder, "ai", "{broken");
    expect(await findInstalledVersion(rootFolder, "ai")).toEqual({
      installed: true,
      version: null,
    });
    await installPackage(rootFolder, "ai", '{"__proto__":{"version":"7.0.126"}}');
    expect((await findInstalledVersion(rootFolder, "ai")).version).toBeNull();
  });

  it("reports a missing package", async () => {
    expect(await findInstalledVersion(rootFolder, "ai")).toEqual({
      installed: false,
      version: null,
    });
  });
});
