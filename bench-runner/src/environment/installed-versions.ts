import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// Versions of the packages the bench ran with, read from their installed package.json files.

const requireFromHere = createRequire(import.meta.url);

const RUNNER_PACKAGE_NAME = "@krinolabs/bench-runner";

type PackageManifest = { name: string; version: string };

/** `name` and `version` of a package.json, or `null` when it cannot be read. */
function readManifest(manifestPath: string): PackageManifest | null {
  try {
    const packageManifest: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (
      typeof packageManifest === "object" &&
      packageManifest !== null &&
      "name" in packageManifest &&
      "version" in packageManifest &&
      typeof packageManifest.name === "string" &&
      typeof packageManifest.version === "string"
    ) {
      return { name: packageManifest.name, version: packageManifest.version };
    }
  } catch {
    // Fall through: a missing version must not stop the bench.
  }
  return null;
}

/** The installed version of `packageName`, or "unknown" when it cannot be read. */
export function readInstalledVersion(packageName: string): string {
  try {
    const manifestPath = requireFromHere.resolve(`${packageName}/package.json`);
    return readManifest(manifestPath)?.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

/** This package's version: the manifest is one folder up from dist/, two from src/environment/. */
function readRunnerVersion(): string {
  for (const relativePath of ["../package.json", "../../package.json"]) {
    const manifest = readManifest(fileURLToPath(new URL(relativePath, import.meta.url)));
    if (manifest?.name === RUNNER_PACKAGE_NAME) {
      return manifest.version;
    }
  }
  return "unknown";
}

export type SdkVersions = {
  ai: string;
  "@krinolabs/krino": string;
  "@krinolabs/bench": string;
  "@krinolabs/bench-runner": string;
  "@krinolabs/cli": string;
  node: string;
};

export function readSdkVersions(): SdkVersions {
  return {
    ai: readInstalledVersion("ai"),
    "@krinolabs/krino": readInstalledVersion("@krinolabs/krino"),
    "@krinolabs/bench": readInstalledVersion("@krinolabs/bench"),
    "@krinolabs/bench-runner": readRunnerVersion(),
    "@krinolabs/cli": readInstalledVersion("@krinolabs/cli"),
    node: process.versions.node,
  };
}
