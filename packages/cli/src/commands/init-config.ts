import type nodePath from "node:path";
import type { DecisionKind, DecisionMode, HostName } from "@krinolabs/krino";

/** Written by `krino init` in the project folder; read by `krino doctor`. */
export const KRINO_CONFIG_FILE_NAME = "krino.config.json";

export const KRINO_CONFIG_DESCRIPTION =
  "krino CLI settings. In v0.1 only the krino CLI (krino doctor) reads this file; the runtime " +
  "does not. Pass the same projectName and decisionModes to createKrino(). A relative " +
  "traceDirectory resolves from this file's folder.";

/** The package each host adapter needs, by host. Checked in this order. */
export const HOST_PACKAGE_NAMES: ReadonlyArray<{ hostName: HostName; packageName: string }> = [
  { hostName: "ai-sdk", packageName: "ai" },
  { hostName: "claude-agent-sdk", packageName: "@anthropic-ai/claude-agent-sdk" },
];

const DEPENDENCY_SECTION_NAMES = ["dependencies", "devDependencies", "peerDependencies"];

export type KrinoConfigFile = {
  description: string;
  projectName: string;
  /** Omitted unless `--trace-dir` was given; stored as typed. */
  traceDirectory?: string;
  decisionModes: Record<DecisionKind, DecisionMode>;
};

export type KrinoConfigFileInput = {
  projectName: string;
  /** `--trace-dir` as typed; `null` leaves the field out (the default folder). */
  traceDirectory: string | null;
};

export type ParsedKrinoConfig =
  | { parseKind: "valid"; projectName: string; traceDirectory: string | null }
  | { parseKind: "invalid"; message: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** An own field of a JSON object, or `undefined`. Never reads the prototype chain. */
function ownField(container: unknown, fieldName: string): unknown {
  return isPlainObject(container) && Object.hasOwn(container, fieldName)
    ? container[fieldName]
    : undefined;
}

function nonBlankString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/** Hosts whose package `package.json` lists in any dependency section, in `HOST_PACKAGE_NAMES` order. */
export function detectHosts(packageManifest: unknown): Array<HostName> {
  const dependencySections = DEPENDENCY_SECTION_NAMES.map((sectionName) =>
    ownField(packageManifest, sectionName),
  ).filter(isPlainObject);
  return HOST_PACKAGE_NAMES.filter(({ packageName }) =>
    dependencySections.some((dependencySection) => Object.hasOwn(dependencySection, packageName)),
  ).map(({ hostName }) => hostName);
}

/** The package name, else the folder name. */
export function projectNameFrom(packageManifest: unknown, folderName: string): string {
  return nonBlankString(ownField(packageManifest, "name")) ?? folderName;
}

/** The file `krino init` writes: every decision kind in shadow mode. */
export function buildKrinoConfigFile(configInput: KrinoConfigFileInput): KrinoConfigFile {
  // A typed literal: a new decision kind fails typecheck here until it gets a mode.
  const decisionModes: Record<DecisionKind, DecisionMode> = {
    toolSelection: "shadow",
    riskGate: "shadow",
    modelRouting: "shadow",
  };
  return {
    description: KRINO_CONFIG_DESCRIPTION,
    projectName: configInput.projectName,
    ...(configInput.traceDirectory === null ? {} : { traceDirectory: configInput.traceDirectory }),
    decisionModes,
  };
}

/** Reads the fields the CLI uses from `krino.config.json` text. */
export function parseKrinoConfigFile(configText: string): ParsedKrinoConfig {
  let configValue: unknown;
  try {
    configValue = JSON.parse(configText.replace(/^﻿/, ""));
  } catch {
    return { parseKind: "invalid", message: `${KRINO_CONFIG_FILE_NAME} is not valid JSON` };
  }
  if (!isPlainObject(configValue)) {
    return { parseKind: "invalid", message: `${KRINO_CONFIG_FILE_NAME} must hold a JSON object` };
  }
  const projectName = nonBlankString(ownField(configValue, "projectName"));
  if (projectName === null) {
    return {
      parseKind: "invalid",
      message: `${KRINO_CONFIG_FILE_NAME} needs a non-empty "projectName"`,
    };
  }
  const traceDirectoryValue = ownField(configValue, "traceDirectory");
  if (traceDirectoryValue === undefined) {
    return { parseKind: "valid", projectName, traceDirectory: null };
  }
  const traceDirectory = nonBlankString(traceDirectoryValue);
  if (traceDirectory === null) {
    return {
      parseKind: "invalid",
      message: `${KRINO_CONFIG_FILE_NAME}: "traceDirectory" must be a non-empty string`,
    };
  }
  return { parseKind: "valid", projectName, traceDirectory };
}

/** A configured trace directory as an absolute path: relative paths start at the config folder. */
export function resolveConfiguredTraceDirectory(
  configFolder: string,
  traceDirectory: string,
  pathModule: Pick<typeof nodePath, "resolve">,
): string {
  return pathModule.resolve(configFolder, traceDirectory);
}
