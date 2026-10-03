import { parseArgs } from "node:util";
import { DEFAULT_TOOL_COUNT, TOOL_COUNTS, type ToolCount } from "./log-triage.js";

export type CliOptions = {
  isFake: boolean;
  /** `--trace-dir`; `null` means krino's default folder. */
  traceDirectory: string | null;
  toolCount: ToolCount;
  showHelp: boolean;
};

/** A bad command line. `main` prints the message and the usage, then exits 2. */
export class CliUsageError extends Error {
  override name = "CliUsageError";
}

function parseCommandLine(argumentList: Array<string>) {
  return parseArgs({
    args: argumentList,
    strict: true,
    allowPositionals: false,
    options: {
      fake: { type: "boolean", default: false },
      tools: { type: "string" },
      "trace-dir": { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
}

function parseToolCount(toolCountText: string | undefined): ToolCount {
  if (toolCountText === undefined) {
    return DEFAULT_TOOL_COUNT;
  }
  const toolCount = TOOL_COUNTS.find((allowedCount) => String(allowedCount) === toolCountText);
  if (toolCount === undefined) {
    throw new CliUsageError(`--tools must be 10, 25, 50 or 100; got "${toolCountText}".`);
  }
  return toolCount;
}

export function parseCliOptions(argumentList: Array<string>): CliOptions {
  let parsedArguments: ReturnType<typeof parseCommandLine>;
  try {
    parsedArguments = parseCommandLine(argumentList);
  } catch (parseError) {
    throw new CliUsageError(parseError instanceof Error ? parseError.message : String(parseError));
  }
  const { values } = parsedArguments;
  return {
    isFake: values.fake,
    traceDirectory: values["trace-dir"] ?? null,
    toolCount: parseToolCount(values.tools),
    showHelp: values.help,
  };
}
