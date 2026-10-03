import { readFile } from "node:fs/promises";
import nodePath from "node:path";
import { resolveTraceDirectory } from "@krinolabs/krino";
import { defineCommand } from "citty";
import { createTextStyle, supportsColor, type TextStyle } from "../terminal/text-style.js";
import { listTraceFiles } from "../trace-reader/list-trace-files.js";
import { nonBlankLines } from "../trace-reader/read-trace-aggregates.js";
import { resolveTraceLocation } from "../trace-reader/trace-directory.js";
import type { DoctorCheck, DoctorCheckStatus } from "./doctor-check.js";
import {
  type ConfigLookup,
  checkCacheHealth,
  checkConfigFile,
  checkCutOffRate,
  checkFakeProvider,
  checkGatewayKey,
  checkNodeVersion,
  checkRecentTraces,
  checkTraceFolderMatch,
  checkTraceFolderWritable,
  type ProbeFileSystem,
  probeFileSystemFromDisk,
  type RecentTraceRead,
} from "./doctor-checks.js";
import { summarizeTraceLines, type TraceScanSummary } from "./doctor-trace-scan.js";
import { checkHostSdkVersions, findInstalledHostSdks } from "./doctor-versions.js";
import {
  KRINO_CONFIG_FILE_NAME,
  parseKrinoConfigFile,
  resolveConfiguredTraceDirectory,
} from "./init-config.js";

/** `krino doctor` reads traces recorded in this many days before now. */
export const RECENT_TRACE_DAYS = 7;

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export type DoctorOptions = {
  /** `--project`; `null` falls back to the config's project, then every project. */
  projectName: string | null;
  /** `--trace-dir`, resolved from the working directory; wins over the config. */
  traceDirectory: string | null;
};

export type DoctorOutput = {
  writeOutput: (text: string) => void;
  /** `process.stdout.isTTY`. */
  isTerminal: boolean | undefined;
};

/** Everything `krino doctor` takes from its surroundings. Injectable for tests. */
export type DoctorDependencies = {
  environment: Readonly<Record<string, string | undefined>>;
  workingDirectory: () => string;
  /** `process.versions.node`. */
  nodeVersion: string;
  /** The file sink's default folder for a project: `resolveTraceDirectory` from `@krinolabs/krino`. */
  defaultTraceDirectory: (projectName: string) => string;
  now: () => Date;
  probeFileSystem: ProbeFileSystem;
};

export function defaultDoctorDependencies(): DoctorDependencies {
  return {
    environment: process.env,
    workingDirectory: () => process.cwd(),
    nodeVersion: process.versions.node,
    defaultTraceDirectory: resolveTraceDirectory,
    now: () => new Date(),
    probeFileSystem: probeFileSystemFromDisk,
  };
}

function errorCode(caughtError: unknown): unknown {
  return typeof caughtError === "object" && caughtError !== null && "code" in caughtError
    ? caughtError.code
    : undefined;
}

function describeError(caughtError: unknown): string {
  return caughtError instanceof Error ? caughtError.message : String(caughtError);
}

function nonBlank(value: string | null): string | null {
  return value === null || value.trim() === "" ? null : value;
}

/** The nearest `krino.config.json` in the working directory or a parent folder. */
async function findKrinoConfig(startFolder: string): Promise<ConfigLookup> {
  let folder = nodePath.resolve(startFolder);
  for (;;) {
    const configPath = nodePath.join(folder, KRINO_CONFIG_FILE_NAME);
    try {
      const parsedConfig = parseKrinoConfigFile(await readFile(configPath, "utf8"));
      return parsedConfig.parseKind === "valid"
        ? {
            configKind: "valid",
            configPath,
            projectName: parsedConfig.projectName,
            traceDirectory: parsedConfig.traceDirectory,
          }
        : { configKind: "invalid", configPath, message: parsedConfig.message };
    } catch (readError) {
      const readErrorCode = errorCode(readError);
      if (readErrorCode !== "ENOENT" && readErrorCode !== "ENOTDIR") {
        return { configKind: "invalid", configPath, message: describeError(readError) };
      }
    }
    const parentFolder = nodePath.dirname(folder);
    if (parentFolder === folder) {
      return { configKind: "missing" };
    }
    folder = parentFolder;
  }
}

async function readRecentTraces(
  traceDirectory: string,
  traceFilePaths: () => Promise<Array<string>>,
  projectName: string | null,
  since: Date,
): Promise<RecentTraceRead> {
  try {
    const filePaths = await traceFilePaths();
    const fileTexts = await Promise.all(filePaths.map((filePath) => readFile(filePath, "utf8")));
    return {
      readKind: "read",
      projectName,
      traceDirectory,
      traceFileCount: filePaths.length,
      traceSummary: summarizeTraceLines(fileTexts.flatMap(nonBlankLines), {
        projectName,
        sinceEpochMilliseconds: since.getTime(),
      }),
    };
  } catch (readError) {
    return { readKind: "readError", traceDirectory, message: describeError(readError) };
  }
}

/** Every check, in the order `krino doctor` prints them. */
export async function collectDoctorChecks(
  doctorOptions: DoctorOptions,
  dependencies: DoctorDependencies,
): Promise<Array<DoctorCheck>> {
  const workingDirectory = dependencies.workingDirectory();
  const configLookup = await findKrinoConfig(workingDirectory);
  const validConfig = configLookup.configKind === "valid" ? configLookup : null;
  const projectName = nonBlank(doctorOptions.projectName) ?? validConfig?.projectName ?? null;
  const configuredTraceDirectory =
    validConfig?.traceDirectory === null || validConfig === null
      ? null
      : resolveConfiguredTraceDirectory(
          nodePath.dirname(validConfig.configPath),
          validConfig.traceDirectory,
          nodePath,
        );
  const traceLocation = resolveTraceLocation({
    traceDirectoryOption: nonBlank(doctorOptions.traceDirectory) ?? configuredTraceDirectory,
    projectName,
    environment: dependencies.environment,
    workingDirectory,
    defaultTraceDirectory: dependencies.defaultTraceDirectory,
    pathModule: nodePath,
  });
  const since = new Date(dependencies.now().getTime() - RECENT_TRACE_DAYS * MILLISECONDS_PER_DAY);

  const [installedHostSdks, writableCheck, recentTraceRead] = await Promise.all([
    findInstalledHostSdks(workingDirectory),
    checkTraceFolderWritable(traceLocation.directoryPath, dependencies.probeFileSystem),
    readRecentTraces(
      traceLocation.directoryPath,
      () => listTraceFiles(traceLocation, since.toISOString().slice(0, 10)),
      projectName,
      since,
    ),
  ]);
  const traceSummary: TraceScanSummary =
    recentTraceRead.readKind === "read"
      ? recentTraceRead.traceSummary
      : summarizeTraceLines([], { projectName, sinceEpochMilliseconds: since.getTime() });

  return [
    checkNodeVersion(dependencies.nodeVersion),
    checkConfigFile(configLookup),
    ...(validConfig === null || validConfig.traceDirectory === null
      ? []
      : [
          checkTraceFolderMatch(
            {
              configFolder: nodePath.dirname(validConfig.configPath),
              workingDirectory,
              traceDirectory: validConfig.traceDirectory,
            },
            nodePath,
          ),
        ]),
    ...checkHostSdkVersions(installedHostSdks),
    checkGatewayKey(dependencies.environment),
    checkFakeProvider(traceSummary),
    writableCheck,
    checkRecentTraces(recentTraceRead),
    checkCutOffRate(traceSummary),
    checkCacheHealth(traceSummary),
  ];
}

const STATUS_LABELS: ReadonlyMap<DoctorCheckStatus, string> = new Map([
  ["pass", "PASS"],
  ["warn", "WARN"],
  ["fail", "FAIL"],
  ["skip", "SKIP"],
]);

function styledStatus(checkStatus: DoctorCheckStatus, textStyle: TextStyle): string {
  const statusLabel = STATUS_LABELS.get(checkStatus) ?? checkStatus;
  if (checkStatus === "pass") {
    return textStyle.accent(statusLabel);
  }
  return checkStatus === "warn"
    ? textStyle.warning(statusLabel)
    : textStyle.bold(textStyle.warning(statusLabel));
}

function checkLine(doctorCheck: DoctorCheck, nameWidth: number, textStyle: TextStyle): string {
  const lineText = (statusText: string): string =>
    `  ${statusText}  ${doctorCheck.checkName.padEnd(nameWidth)}  ${doctorCheck.detail}`;
  // A skip is not a result: the whole line is dimmed.
  return doctorCheck.checkStatus === "skip"
    ? textStyle.dim(lineText(STATUS_LABELS.get("skip") ?? "SKIP"))
    : lineText(styledStatus(doctorCheck.checkStatus, textStyle));
}

/** One line per check, a fix line under each warn or fail, then the totals. */
export function renderDoctorText(
  doctorChecks: ReadonlyArray<DoctorCheck>,
  textStyle: TextStyle,
): string {
  const nameWidth = Math.max(...doctorChecks.map((doctorCheck) => doctorCheck.checkName.length));
  const checkLines = doctorChecks.flatMap((doctorCheck) => [
    checkLine(doctorCheck, nameWidth, textStyle),
    ...(doctorCheck.fixLine === null
      ? []
      : [`        ${textStyle.dim(`fix: ${doctorCheck.fixLine}`)}`]),
  ]);
  const countOf = (checkStatus: DoctorCheckStatus): number =>
    doctorChecks.filter((doctorCheck) => doctorCheck.checkStatus === checkStatus).length;
  return [
    textStyle.bold("krino doctor"),
    "",
    ...checkLines,
    "",
    `${countOf("pass")} pass, ${countOf("warn")} warn, ${countOf("fail")} fail, ${countOf("skip")} skipped`,
    "",
  ].join("\n");
}

/** Runs `krino doctor` and returns the exit code: 1 when any check fails, else 0. */
export async function runDoctor(
  doctorOptions: DoctorOptions,
  doctorOutput: DoctorOutput,
  dependencies: DoctorDependencies = defaultDoctorDependencies(),
): Promise<number> {
  const doctorChecks = await collectDoctorChecks(doctorOptions, dependencies);
  const textStyle = createTextStyle(
    supportsColor({ environment: dependencies.environment, isTerminal: doctorOutput.isTerminal }),
  );
  doctorOutput.writeOutput(renderDoctorText(doctorChecks, textStyle));
  return doctorChecks.some((doctorCheck) => doctorCheck.checkStatus === "fail") ? 1 : 0;
}

export const doctorCommand = defineCommand({
  meta: {
    name: "doctor",
    description: "Check Node, host SDK versions, the API key, the trace folder and recent traces.",
  },
  args: {
    project: {
      type: "string",
      description: "Project name (default: projectName in krino.config.json)",
    },
    "trace-dir": {
      type: "string",
      description:
        "Folder with the trace files (default: krino.config.json, then $KRINO_TRACE_DIRECTORY, then ~/.krino/traces/<project>)",
    },
  },
  run: async ({ args }) => {
    process.exitCode = await runDoctor(
      { projectName: args.project ?? null, traceDirectory: args["trace-dir"] ?? null },
      {
        writeOutput: (text) => process.stdout.write(text),
        isTerminal: process.stdout.isTTY,
      },
    );
  },
});
