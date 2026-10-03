import { readFile } from "node:fs/promises";
import { readTarballEntries } from "./read-tarball.js";
import { findUnexpectedTarballFiles, packagePathOf } from "./tarball-rules.js";

/** The parts of a packed package.json the e2e checks read. */
export type PackedManifest = {
  name: string;
  version: string;
  dependencies: ReadonlyMap<string, string>;
  optionalDependencies: ReadonlyMap<string, string>;
};

export type PackedContents = {
  /** Paths relative to the package root, in archive order. */
  filePaths: Array<string>;
  unexpectedFilePaths: Array<string>;
  /** package.json exactly as packed. */
  manifestText: string;
  manifest: PackedManifest;
  /** Every file's content by package path. */
  fileContents: ReadonlyMap<string, Buffer>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A dependency field as a Map: names come from the manifest, so no plain-object lookups. */
function dependencyMap(fieldValue: unknown): ReadonlyMap<string, string> {
  if (!isRecord(fieldValue)) {
    return new Map();
  }
  return new Map(
    Object.entries(fieldValue).flatMap(([dependencyName, versionRange]) =>
      typeof versionRange === "string" ? [[dependencyName, versionRange] as const] : [],
    ),
  );
}

export function parsePackedManifest(manifestText: string): PackedManifest {
  const parsedManifest: unknown = JSON.parse(manifestText);
  if (
    !isRecord(parsedManifest) ||
    typeof parsedManifest.name !== "string" ||
    typeof parsedManifest.version !== "string"
  ) {
    throw new Error("The packed package.json has no string name and version.");
  }
  return {
    name: parsedManifest.name,
    version: parsedManifest.version,
    dependencies: dependencyMap(parsedManifest.dependencies),
    optionalDependencies: dependencyMap(parsedManifest.optionalDependencies),
  };
}

export async function readPackedPackage(tarballPath: string): Promise<PackedContents> {
  const entries = readTarballEntries(await readFile(tarballPath));
  const fileContents = new Map(
    entries.map((entry) => [packagePathOf(entry.path), entry.content] as const),
  );
  const manifestContent = fileContents.get("package.json");
  if (manifestContent === undefined) {
    throw new Error(`${tarballPath} has no package/package.json.`);
  }
  const manifestText = manifestContent.toString("utf8");
  const filePaths = [...fileContents.keys()];
  return {
    filePaths,
    unexpectedFilePaths: findUnexpectedTarballFiles(filePaths),
    manifestText,
    manifest: parsePackedManifest(manifestText),
    fileContents,
  };
}
