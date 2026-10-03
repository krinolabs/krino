import { readFile, writeFile } from "node:fs/promises";
import nodePath from "node:path";
import { type HostName, resolveTraceDirectory } from "@krinolabs/krino";
import { defineCommand } from "citty";
import {
  buildKrinoConfigFile,
  detectHosts,
  HOST_PACKAGE_NAMES,
  KRINO_CONFIG_FILE_NAME,
  projectNameFrom,
  resolveConfiguredTraceDirectory,
} from "./init-config.js";
import { renderWrapperSnippet } from "./init-snippets.js";

export type InitOptions = {
  /** `--trace-dir` as typed; `null` leaves it out of the config (the default folder). */
  traceDirectory: string | null;
  /** `--force`: overwrite an existing `krino.config.json`. */
  force: boolean;
};

export type InitOutput = {
  writeOutput: (text: string) => void;
  writeError: (text: string) => void;
};

/** Everything `krino init` takes from its surroundings. Injectable for tests. */
export type InitDependencies = {
  workingDirectory: () => string;
  /** The file sink's default folder for a project: `resolveTraceDirectory` from `@krinolabs/krino`. */
  defaultTraceDirectory: (projectName: string) => string;
};

const HOST_LABELS: ReadonlyMap<HostName, string> = new Map([
  ["ai-sdk", "Vercel AI SDK"],
  ["claude-agent-sdk", "Claude Agent SDK"],
]);

function errorCode(caughtError: unknown): unknown {
  return typeof caughtError === "object" && caughtError !== null && "code" in caughtError
    ? caughtError.code
    : undefined;
}

function describeError(caughtError: unknown): string {
  return caughtError instanceof Error ? caughtError.message : String(caughtError);
}

function hostSection(hostName: HostName, snippetText: string): string {
  const packageName =
    HOST_PACKAGE_NAMES.find((hostPackage) => hostPackage.hostName === hostName)?.packageName ?? "";
  return `Detected host: ${HOST_LABELS.get(hostName) ?? hostName} (${packageName})\n\n${snippetText}\n`;
}

function noHostSection(): string {
  return [
    "No host SDK found in package.json. Install one, then run `krino init --force`:",
    ...HOST_PACKAGE_NAMES.map(
      ({ hostName, packageName }) =>
        `  ${HOST_LABELS.get(hostName) ?? hostName}: npm install ${packageName}`,
    ),
    "",
  ].join("\n");
}

/**
 * Runs `krino init` and returns the exit code: writes `krino.config.json` next to `package.json`
 * and prints the wrapper snippet for each detected host. Never edits any other file.
 */
export async function runInit(
  initOptions: InitOptions,
  initOutput: InitOutput,
  dependencies: InitDependencies = {
    workingDirectory: () => process.cwd(),
    defaultTraceDirectory: resolveTraceDirectory,
  },
): Promise<number> {
  const projectFolder = dependencies.workingDirectory();
  let manifestText: string;
  try {
    manifestText = await readFile(nodePath.join(projectFolder, "package.json"), "utf8");
  } catch (readError) {
    initOutput.writeError(
      errorCode(readError) === "ENOENT"
        ? `krino init: no package.json in ${projectFolder}. Run it in your project's folder.\n`
        : `krino init: could not read package.json: ${describeError(readError)}\n`,
    );
    return 1;
  }
  let packageManifest: unknown;
  try {
    packageManifest = JSON.parse(manifestText.replace(/^﻿/, ""));
  } catch {
    initOutput.writeError("krino init: package.json is not valid JSON.\n");
    return 1;
  }

  const traceDirectory =
    initOptions.traceDirectory === null || initOptions.traceDirectory.trim() === ""
      ? null
      : initOptions.traceDirectory;
  const projectName = projectNameFrom(packageManifest, nodePath.basename(projectFolder));
  const configFile = buildKrinoConfigFile({ projectName, traceDirectory });
  const configPath = nodePath.join(projectFolder, KRINO_CONFIG_FILE_NAME);
  try {
    // `wx` fails when the file exists, so a file created since the check is never overwritten.
    await writeFile(configPath, `${JSON.stringify(configFile, null, 2)}\n`, {
      flag: initOptions.force ? "w" : "wx",
    });
  } catch (writeError) {
    initOutput.writeError(
      errorCode(writeError) === "EEXIST"
        ? `krino init: ${KRINO_CONFIG_FILE_NAME} already exists. Use --force to overwrite it.\n`
        : `krino init: could not write ${KRINO_CONFIG_FILE_NAME}: ${describeError(writeError)}\n`,
    );
    return 1;
  }

  const traceFolderLine =
    traceDirectory === null
      ? `Traces: ${dependencies.defaultTraceDirectory(projectName)} (default folder)`
      : `Traces: ${resolveConfiguredTraceDirectory(projectFolder, traceDirectory, nodePath)}`;
  const hostNames = detectHosts(packageManifest);
  const hostSections =
    hostNames.length === 0
      ? [noHostSection()]
      : hostNames.map((hostName) =>
          hostSection(hostName, renderWrapperSnippet(hostName, { projectName, traceDirectory })),
        );
  initOutput.writeOutput(
    [
      `Wrote ${KRINO_CONFIG_FILE_NAME} (project "${projectName}", every decision mode: shadow).`,
      traceFolderLine,
      `In v0.1 only the krino CLI reads ${KRINO_CONFIG_FILE_NAME}; pass the same values to createKrino().`,
      "",
      ...hostSections,
      "Next: run your agent, then `krino doctor` and `krino report`.",
      "",
    ].join("\n"),
  );
  return 0;
}

export const initCommand = defineCommand({
  meta: {
    name: "init",
    description: "Write krino.config.json (shadow mode) and print the wrapper for your host SDK.",
  },
  args: {
    "trace-dir": {
      type: "string",
      description:
        "Trace folder to store in the config, relative to it (default: the sink's folder)",
    },
    force: {
      type: "boolean",
      description: "Overwrite an existing krino.config.json",
      default: false,
    },
  },
  run: async ({ args }) => {
    process.exitCode = await runInit(
      { traceDirectory: args["trace-dir"] ?? null, force: args.force },
      {
        writeOutput: (text) => process.stdout.write(text),
        writeError: (text) => process.stderr.write(text),
      },
    );
  },
});
