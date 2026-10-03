import { parseArgs } from "node:util";
import { TOOL_COUNTS, type ToolCount } from "@krinolabs/example-ai-sdk-cli/agent";
import { BENCH_SETUP_NAMES, type BenchSetupName, type RunSelection } from "../plan/run-plan.js";

export const DEFAULT_REPEAT_COUNT = 2;
export const DEFAULT_MAX_SPEND_IN_USD = 20;
export const DEFAULT_TOOL_COUNTS: ReadonlyArray<ToolCount> = [100];

export type BenchOptions = {
  /** In `BENCH_SETUP_NAMES` order. */
  setupNames: Array<BenchSetupName>;
  runSelection: RunSelection;
  /** Ascending. */
  toolCounts: Array<ToolCount>;
  maxSpendInUsd: number;
  isFake: boolean;
  /** `--trace-dir`; `null` means `resolveTraceDirectory("krino-bench")`. */
  traceDirectory: string | null;
  /** `--out`; `null` means a dated file in the trace folder. */
  outputPath: string | null;
  printJson: boolean;
  showHelp: boolean;
};

/** A bad command line. `main` prints the message and the usage, then exits 2. */
export class BenchUsageError extends Error {
  override name = "BenchUsageError";
}

function parseCommandLine(argumentList: Array<string>) {
  return parseArgs({
    args: argumentList,
    strict: true,
    allowPositionals: false,
    options: {
      setups: { type: "string" },
      repeats: { type: "string" },
      pilot: { type: "boolean", default: false },
      "tool-counts": { type: "string" },
      "max-spend-usd": { type: "string" },
      fake: { type: "boolean", default: false },
      "trace-dir": { type: "string" },
      out: { type: "string" },
      json: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
}

function splitList(listText: string): Array<string> {
  return listText
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

function parseSetupNames(setupsText: string | undefined): Array<BenchSetupName> {
  if (setupsText === undefined) {
    return [...BENCH_SETUP_NAMES];
  }
  const requestedNames = new Set(splitList(setupsText));
  const unknownNames = [...requestedNames].filter(
    (setupName) => !BENCH_SETUP_NAMES.some((knownName) => knownName === setupName),
  );
  if (requestedNames.size === 0 || unknownNames.length > 0) {
    throw new BenchUsageError(
      `--setups takes a comma list of ${BENCH_SETUP_NAMES.join(", ")}; got "${setupsText}".`,
    );
  }
  return BENCH_SETUP_NAMES.filter((setupName) => requestedNames.has(setupName));
}

function parseToolCounts(toolCountsText: string | undefined): Array<ToolCount> {
  if (toolCountsText === undefined) {
    return [...DEFAULT_TOOL_COUNTS];
  }
  const requestedCounts = new Set(splitList(toolCountsText));
  const unknownCounts = [...requestedCounts].filter(
    (countText) => !TOOL_COUNTS.some((toolCount) => String(toolCount) === countText),
  );
  if (requestedCounts.size === 0 || unknownCounts.length > 0) {
    throw new BenchUsageError(
      `--tool-counts takes a comma list of ${TOOL_COUNTS.join(", ")}; got "${toolCountsText}".`,
    );
  }
  return TOOL_COUNTS.filter((toolCount) => requestedCounts.has(String(toolCount)));
}

function parseRunSelection(repeatsText: string | undefined, isPilot: boolean): RunSelection {
  if (isPilot && repeatsText !== undefined) {
    throw new BenchUsageError(
      "--pilot and --repeats do not go together: the pilot is a fixed 10-run sample.",
    );
  }
  if (isPilot) {
    return { selectionKind: "pilot" };
  }
  if (repeatsText === undefined) {
    return { selectionKind: "repeats", repeatCount: DEFAULT_REPEAT_COUNT };
  }
  const repeatCount = Number(repeatsText);
  if (!/^\d+$/.test(repeatsText) || !Number.isSafeInteger(repeatCount) || repeatCount < 1) {
    throw new BenchUsageError(
      `--repeats must be a whole number of 1 or more; got "${repeatsText}".`,
    );
  }
  return { selectionKind: "repeats", repeatCount };
}

function parseMaxSpend(maxSpendText: string | undefined): number {
  if (maxSpendText === undefined) {
    return DEFAULT_MAX_SPEND_IN_USD;
  }
  const maxSpendInUsd = Number(maxSpendText);
  if (maxSpendText.trim() === "" || !Number.isFinite(maxSpendInUsd) || maxSpendInUsd <= 0) {
    throw new BenchUsageError(
      `--max-spend-usd must be a positive number of US dollars; got "${maxSpendText}".`,
    );
  }
  return maxSpendInUsd;
}

export function parseBenchOptions(argumentList: Array<string>): BenchOptions {
  let parsedArguments: ReturnType<typeof parseCommandLine>;
  try {
    parsedArguments = parseCommandLine(argumentList);
  } catch (parseError) {
    throw new BenchUsageError(
      parseError instanceof Error ? parseError.message : String(parseError),
    );
  }
  const { values } = parsedArguments;
  return {
    setupNames: parseSetupNames(values.setups),
    runSelection: parseRunSelection(values.repeats, values.pilot),
    toolCounts: parseToolCounts(values["tool-counts"]),
    maxSpendInUsd: parseMaxSpend(values["max-spend-usd"]),
    isFake: values.fake,
    traceDirectory: values["trace-dir"] ?? null,
    outputPath: values.out ?? null,
    printJson: values.json,
    showHelp: values.help,
  };
}
