import nodePath from "node:path";
import { DEFAULT_MODEL_PRICES, type ModelPrice, resolveTraceDirectory } from "@krinolabs/krino";
import { defineCommand } from "citty";
import { renderBanner } from "../banner/krino-banner.js";
import { buildReport } from "../report/build-report.js";
import { parseSince } from "../report/parse-since.js";
import { parseTokensPerTool } from "../report/parse-tokens-per-tool.js";
import { renderReportText } from "../report/render-report-text.js";
import type { KrinoReport } from "../report/report-types.js";
import { createTextStyle, supportsColor } from "../terminal/text-style.js";
import { type ListDirectory, listTraceFiles } from "../trace-reader/list-trace-files.js";
import { readTraceAggregates } from "../trace-reader/read-trace-aggregates.js";
import { resolveTraceLocation } from "../trace-reader/trace-directory.js";

/**
 * Traces do not record how many prompt tokens a tool definition takes, so the saving estimate
 * assumes this many per tool (`--tokens-per-tool`). Measured from the bench catalog:
 * 17,518 tokens for 100 tool definitions. Shown in every report.
 */
export const DEFAULT_TOKENS_PER_TOOL_DEFINITION = 175;

export const DEFAULT_SINCE = "7d";

export type ReportOptions = {
  /** `null` reads every project. */
  projectName: string | null;
  sinceText: string;
  /** `--trace-dir`; `null` falls back to `$KRINO_TRACE_DIRECTORY`, then the default folder. */
  traceDirectory: string | null;
  /** `--tokens-per-tool`, as typed; checked by `createReport`. */
  tokensPerToolText: string;
};

/** Everything `krino report` takes from its surroundings. Injectable for tests. */
export type ReportDependencies = {
  environment: Readonly<Record<string, string | undefined>>;
  /** The file sink's default folder for a project: `resolveTraceDirectory` from `@krinolabs/krino`. */
  defaultTraceDirectory: (projectName: string) => string;
  workingDirectory: () => string;
  now: () => Date;
  listDirectory?: ListDirectory;
  modelPrices: ReadonlyArray<ModelPrice>;
};

export type ReportOutput = {
  writeOutput: (text: string) => void;
  writeError: (text: string) => void;
  /** `process.stdout.isTTY`. */
  isTerminal: boolean | undefined;
};

export function defaultReportDependencies(): ReportDependencies {
  return {
    environment: process.env,
    defaultTraceDirectory: resolveTraceDirectory,
    workingDirectory: () => process.cwd(),
    now: () => new Date(),
    modelPrices: DEFAULT_MODEL_PRICES,
  };
}

export type CreateReportResult =
  | { resultKind: "report"; report: KrinoReport }
  | { resultKind: "invalidOptions"; message: string };

/** Reads the traces and builds the report. The engine behind `krino report`; also for `bench`. */
export async function createReport(
  reportOptions: ReportOptions,
  dependencies: ReportDependencies,
): Promise<CreateReportResult> {
  const generatedAt = dependencies.now();
  const sinceResult = parseSince(reportOptions.sinceText, generatedAt);
  if (sinceResult.parseKind === "invalid") {
    return { resultKind: "invalidOptions", message: sinceResult.message };
  }
  const { since } = sinceResult;
  const tokensPerToolResult = parseTokensPerTool(reportOptions.tokensPerToolText);
  if (tokensPerToolResult.parseKind === "invalid") {
    return { resultKind: "invalidOptions", message: tokensPerToolResult.message };
  }
  const { tokensPerToolDefinition } = tokensPerToolResult;
  const projectName =
    reportOptions.projectName === null || reportOptions.projectName.trim() === ""
      ? null
      : reportOptions.projectName;
  const traceLocation = resolveTraceLocation({
    traceDirectoryOption: reportOptions.traceDirectory,
    projectName,
    environment: dependencies.environment,
    workingDirectory: dependencies.workingDirectory(),
    defaultTraceDirectory: dependencies.defaultTraceDirectory,
    pathModule: nodePath,
  });
  const traceFilePaths = await listTraceFiles(
    traceLocation,
    since.toISOString().slice(0, 10),
    dependencies.listDirectory,
  );
  const traceAggregates = await readTraceAggregates(traceFilePaths, {
    projectName,
    sinceEpochMilliseconds: since.getTime(),
    tokensPerToolDefinition,
  });
  return {
    resultKind: "report",
    report: buildReport(traceAggregates, {
      projectName,
      since,
      generatedAt,
      traceDirectory: traceLocation.directoryPath,
      tokensPerToolDefinition,
      modelPrices: dependencies.modelPrices,
    }),
  };
}

function describeError(caughtError: unknown): string {
  return caughtError instanceof Error ? caughtError.message : String(caughtError);
}

/** Runs `krino report` and returns the exit code: 0 on success, 1 on bad options or read errors. */
export async function runReport(
  reportOptions: ReportOptions & { json: boolean },
  reportOutput: ReportOutput,
  dependencies: ReportDependencies = defaultReportDependencies(),
): Promise<number> {
  let reportResult: CreateReportResult;
  try {
    reportResult = await createReport(reportOptions, dependencies);
  } catch (readError) {
    reportOutput.writeError(`krino report: could not read traces: ${describeError(readError)}\n`);
    return 1;
  }
  if (reportResult.resultKind === "invalidOptions") {
    reportOutput.writeError(`krino report: ${reportResult.message}\n`);
    return 1;
  }
  if (reportOptions.json) {
    reportOutput.writeOutput(`${JSON.stringify(reportResult.report, null, 2)}\n`);
    return 0;
  }
  const textStyle = createTextStyle(
    supportsColor({ environment: dependencies.environment, isTerminal: reportOutput.isTerminal }),
  );
  // The banner is decoration: only for people at a terminal, never in pipes or files.
  const bannerText =
    reportOutput.isTerminal === true ? `${renderBanner(textStyle).join("\n")}\n\n` : "";
  reportOutput.writeOutput(`${bannerText}${renderReportText(reportResult.report, textStyle)}`);
  return 0;
}

export const reportCommand = defineCommand({
  meta: {
    name: "report",
    description: "Summarize krino traces: decisions, agreement, savings, cache health, cut-offs.",
  },
  args: {
    project: {
      type: "string",
      description: "Project name to report on (default: every project)",
    },
    "trace-dir": {
      type: "string",
      description:
        "Folder with the trace files (default: $KRINO_TRACE_DIRECTORY, then ~/.krino/traces/<project>)",
    },
    since: {
      type: "string",
      description: "Only records since this duration (12h, 7d, 2w) or ISO date",
      default: DEFAULT_SINCE,
    },
    "tokens-per-tool": {
      type: "string",
      description: "Prompt tokens per tool definition, for the estimated saving",
      default: String(DEFAULT_TOKENS_PER_TOOL_DEFINITION),
    },
    json: {
      type: "boolean",
      description: "Print the report as JSON (stable shape, reportSchemaVersion 1)",
      default: false,
    },
  },
  run: async ({ args }) => {
    process.exitCode = await runReport(
      {
        projectName: args.project ?? null,
        sinceText: args.since,
        traceDirectory: args["trace-dir"] ?? null,
        tokensPerToolText: args["tokens-per-tool"],
        json: args.json,
      },
      {
        writeOutput: (text) => process.stdout.write(text),
        writeError: (text) => process.stderr.write(text),
        isTerminal: process.stdout.isTTY,
      },
    );
  },
});
