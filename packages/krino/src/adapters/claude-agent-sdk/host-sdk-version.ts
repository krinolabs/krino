import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import nodePath from "node:path";

const CLAUDE_AGENT_SDK_PACKAGE_NAME = "@anthropic-ai/claude-agent-sdk";
export const UNKNOWN_HOST_SDK_VERSION = "unknown";

/** How many folders above the package entry file to look for its `package.json`. */
const MAXIMUM_FOLDER_LEVELS = 3;

export type PackageFileAccess = {
  /** Absolute path of the package's entry file. Throws when the package is not installed. */
  resolvePackageEntry: (packageName: string) => string;
  readTextFile: (filePath: string) => Promise<string>;
};

const nodePackageFileAccess: PackageFileAccess = {
  resolvePackageEntry: (packageName) => createRequire(import.meta.url).resolve(packageName),
  readTextFile: (filePath) => readFile(filePath, "utf8"),
};

function versionFromPackageJson(packageJsonText: string): string | null {
  const packageJson: unknown = JSON.parse(packageJsonText);
  if (typeof packageJson !== "object" || packageJson === null) {
    return null;
  }
  const packageName = Object.hasOwn(packageJson, "name") ? Reflect.get(packageJson, "name") : null;
  const packageVersion = Object.hasOwn(packageJson, "version")
    ? Reflect.get(packageJson, "version")
    : null;
  return packageName === CLAUDE_AGENT_SDK_PACKAGE_NAME && typeof packageVersion === "string"
    ? packageVersion
    : null;
}

/**
 * The installed Claude Agent SDK version, read from its `package.json` (the SDK exports no version
 * constant, and its exports map has no `./package.json`). `"unknown"` when it cannot be read.
 * Never throws.
 */
export async function readHostSdkVersion(
  packageFileAccess: PackageFileAccess = nodePackageFileAccess,
): Promise<string> {
  let folderPath: string;
  try {
    folderPath = nodePath.dirname(
      packageFileAccess.resolvePackageEntry(CLAUDE_AGENT_SDK_PACKAGE_NAME),
    );
  } catch {
    return UNKNOWN_HOST_SDK_VERSION;
  }
  for (let folderLevel = 0; folderLevel <= MAXIMUM_FOLDER_LEVELS; folderLevel += 1) {
    try {
      const packageJsonText = await packageFileAccess.readTextFile(
        nodePath.join(folderPath, "package.json"),
      );
      const packageVersion = versionFromPackageJson(packageJsonText);
      if (packageVersion !== null) {
        return packageVersion;
      }
    } catch {
      // No readable package.json here; look one folder up.
    }
    folderPath = nodePath.dirname(folderPath);
  }
  return UNKNOWN_HOST_SDK_VERSION;
}

let cachedHostSdkVersion: Promise<string> | null = null;

/** `readHostSdkVersion`, read once per process. */
export function claudeAgentSdkVersion(): Promise<string> {
  cachedHostSdkVersion ??= readHostSdkVersion();
  return cachedHostSdkVersion;
}
