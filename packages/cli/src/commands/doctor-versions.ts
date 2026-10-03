import { readFile } from "node:fs/promises";
import nodePath from "node:path";
import { type DoctorCheck, failCheck, passCheck, warnCheck } from "./doctor-check.js";

// Host SDK versions krino is tested with. A test pins these to the peer range and dev version in
// @krinolabs/krino's package.json, so the two cannot drift apart.

export type ParsedVersion = {
  major: number;
  minor: number;
  patch: number;
  /** `"beta.2"` for `8.0.0-beta.2`; `null` for a release. */
  prerelease: string | null;
};

/** `>= minimumVersion` and a major below `belowMajor`. */
export type VersionRange = {
  rangeText: string;
  minimumVersion: ParsedVersion;
  /** `null`: no upper bound. */
  belowMajor: number | null;
};

function release(major: number, minor: number, patch: number): ParsedVersion {
  return { major, minor, patch, prerelease: null };
}

export const AI_SDK_TESTED_RANGE: VersionRange = {
  rangeText: ">=7.0.111 <8",
  minimumVersion: release(7, 0, 111),
  belowMajor: 8,
};

export const CLAUDE_AGENT_SDK_PEER_RANGE: VersionRange = {
  rangeText: ">=0.3.0",
  minimumVersion: release(0, 3, 0),
  belowMajor: null,
};

export const CLAUDE_AGENT_SDK_TESTED_VERSION = "0.3.286";

const AI_PACKAGE_NAME = "ai";
const CLAUDE_AGENT_SDK_PACKAGE_NAME = "@anthropic-ai/claude-agent-sdk";

const VERSION_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

export function parseVersion(versionText: string): ParsedVersion | null {
  const versionMatch = VERSION_PATTERN.exec(versionText);
  if (versionMatch === null) {
    return null;
  }
  return {
    major: Number(versionMatch[1]),
    minor: Number(versionMatch[2]),
    patch: Number(versionMatch[3]),
    prerelease: versionMatch[4] ?? null,
  };
}

/** Negative when `left` comes first. A prerelease comes before its release. */
function compareVersions(left: ParsedVersion, right: ParsedVersion): number {
  const coreDifference =
    left.major - right.major || left.minor - right.minor || left.patch - right.patch;
  if (coreDifference !== 0) {
    return coreDifference;
  }
  if (left.prerelease === right.prerelease) {
    return 0;
  }
  if (left.prerelease === null) {
    return 1;
  }
  if (right.prerelease === null) {
    return -1;
  }
  return left.prerelease < right.prerelease ? -1 : 1;
}

function isInsideRange(version: ParsedVersion, versionRange: VersionRange): boolean {
  return (
    compareVersions(version, versionRange.minimumVersion) >= 0 &&
    (versionRange.belowMajor === null || version.major < versionRange.belowMajor)
  );
}

export type InstalledVersion = {
  installed: boolean;
  /** `null` when not installed, or when its package.json has no readable version. */
  version: string | null;
};

export type InstalledHostSdks = {
  ai: InstalledVersion;
  claudeAgentSdk: InstalledVersion;
};

function unreadableVersionCheck(packageName: string, fixLine: string): DoctorCheck {
  return warnCheck(packageName, "installed, but its version could not be read", fixLine);
}

function checkAiSdkVersion(versionText: string | null): DoctorCheck {
  const fixLine = `npm install "${AI_PACKAGE_NAME}@${AI_SDK_TESTED_RANGE.rangeText}"`;
  const version = versionText === null ? null : parseVersion(versionText);
  if (versionText === null || version === null) {
    return unreadableVersionCheck(AI_PACKAGE_NAME, fixLine);
  }
  if (!isInsideRange(version, AI_SDK_TESTED_RANGE)) {
    return failCheck(
      AI_PACKAGE_NAME,
      `${versionText} is outside the supported range ${AI_SDK_TESTED_RANGE.rangeText}`,
      fixLine,
    );
  }
  if (version.prerelease !== null) {
    return warnCheck(
      AI_PACKAGE_NAME,
      `${versionText} is a prerelease; krino is tested with releases in ${AI_SDK_TESTED_RANGE.rangeText}`,
      fixLine,
    );
  }
  return passCheck(
    AI_PACKAGE_NAME,
    `${versionText} (tested range ${AI_SDK_TESTED_RANGE.rangeText})`,
  );
}

function checkClaudeAgentSdkVersion(versionText: string | null): DoctorCheck {
  const fixLine = `npm install ${CLAUDE_AGENT_SDK_PACKAGE_NAME}@${CLAUDE_AGENT_SDK_TESTED_VERSION}`;
  const version = versionText === null ? null : parseVersion(versionText);
  if (versionText === null || version === null) {
    return unreadableVersionCheck(CLAUDE_AGENT_SDK_PACKAGE_NAME, fixLine);
  }
  if (!isInsideRange(version, CLAUDE_AGENT_SDK_PEER_RANGE)) {
    return failCheck(
      CLAUDE_AGENT_SDK_PACKAGE_NAME,
      `${versionText} is below the supported range ${CLAUDE_AGENT_SDK_PEER_RANGE.rangeText}`,
      fixLine,
    );
  }
  if (versionText !== CLAUDE_AGENT_SDK_TESTED_VERSION) {
    return warnCheck(
      CLAUDE_AGENT_SDK_PACKAGE_NAME,
      `${versionText}; krino is tested with ${CLAUDE_AGENT_SDK_TESTED_VERSION}`,
      fixLine,
    );
  }
  return passCheck(CLAUDE_AGENT_SDK_PACKAGE_NAME, `${versionText} (tested version)`);
}

/** One check per installed host SDK, or one warning when neither is installed. */
export function checkHostSdkVersions(installedHostSdks: InstalledHostSdks): Array<DoctorCheck> {
  const hostChecks: Array<DoctorCheck> = [];
  if (installedHostSdks.ai.installed) {
    hostChecks.push(checkAiSdkVersion(installedHostSdks.ai.version));
  }
  if (installedHostSdks.claudeAgentSdk.installed) {
    hostChecks.push(checkClaudeAgentSdkVersion(installedHostSdks.claudeAgentSdk.version));
  }
  if (hostChecks.length === 0) {
    hostChecks.push(
      warnCheck(
        "Host SDK",
        "neither ai nor @anthropic-ai/claude-agent-sdk is installed here",
        `npm install "${AI_PACKAGE_NAME}@${AI_SDK_TESTED_RANGE.rangeText}" or npm install ${CLAUDE_AGENT_SDK_PACKAGE_NAME}@${CLAUDE_AGENT_SDK_TESTED_VERSION}, then krino init`,
      ),
    );
  }
  return hostChecks;
}

/** Reads one text file. Injectable for tests. */
export type ReadTextFile = (filePath: string) => Promise<string>;

const readTextFromDisk: ReadTextFile = (filePath) => readFile(filePath, "utf8");

function versionFromManifest(manifestText: string): string | null {
  try {
    const packageManifest: unknown = JSON.parse(manifestText);
    if (
      typeof packageManifest === "object" &&
      packageManifest !== null &&
      Object.hasOwn(packageManifest, "version") &&
      "version" in packageManifest &&
      typeof packageManifest.version === "string"
    ) {
      return packageManifest.version;
    }
  } catch {
    // Unreadable manifest: installed, version unknown.
  }
  return null;
}

/**
 * The version of `packageName` that Node would load from `startFolder`: the first
 * `node_modules/<packageName>/package.json` in that folder or a parent folder.
 */
export async function findInstalledVersion(
  startFolder: string,
  packageName: string,
  readTextFile: ReadTextFile = readTextFromDisk,
): Promise<InstalledVersion> {
  let folder = nodePath.resolve(startFolder);
  for (;;) {
    const manifestPath = nodePath.join(
      folder,
      "node_modules",
      ...packageName.split("/"),
      "package.json",
    );
    let manifestText: string | null = null;
    try {
      manifestText = await readTextFile(manifestPath);
    } catch {
      // Not installed in this folder: try the parent.
    }
    if (manifestText !== null) {
      return { installed: true, version: versionFromManifest(manifestText) };
    }
    const parentFolder = nodePath.dirname(folder);
    if (parentFolder === folder) {
      return { installed: false, version: null };
    }
    folder = parentFolder;
  }
}

/** Both host SDKs as installed for `projectFolder`. */
export async function findInstalledHostSdks(
  projectFolder: string,
  readTextFile: ReadTextFile = readTextFromDisk,
): Promise<InstalledHostSdks> {
  const [ai, claudeAgentSdk] = await Promise.all([
    findInstalledVersion(projectFolder, AI_PACKAGE_NAME, readTextFile),
    findInstalledVersion(projectFolder, CLAUDE_AGENT_SDK_PACKAGE_NAME, readTextFile),
  ]);
  return { ai, claudeAgentSdk };
}
