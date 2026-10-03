import nodePath from "node:path";
import { resolveTraceDirectory } from "@krinolabs/krino";
import { type CliOptions, CliUsageError, parseCliOptions } from "./cli-options.js";
import { runFakeLogTriage } from "./fake-run.js";
import { findMissingKeyVariables, runLiveLogTriage } from "./live-run.js";
import { LIVE_MODEL_IDENTIFIER, PROJECT_NAME } from "./log-triage.js";
import { DEFAULT_TASK_IDENTIFIER, EXAMPLE_TASKS, resolveExampleTask } from "./log-triage-tasks.js";

const TASK_LINES = EXAMPLE_TASKS.map(
  (exampleTask) => `                  ${exampleTask.taskIdentifier}: ${exampleTask.summary}`,
).join("\n");

const USAGE = `Usage: pnpm start [--fake] [--task <id>] [--tools 10|25|50|100] [--trace-dir <folder>]

  --fake        No API keys, no network: the AI SDK mock model and krino's fake decision provider.
  --task        Which bench task to run (default ${DEFAULT_TASK_IDENTIFIER}):
${TASK_LINES}
  --tools       How many bench catalog tools the agent gets (default 100).
  --trace-dir   Where krino writes traces (default: $KRINO_TRACE_DIRECTORY, then ~/.krino).

Live mode (no --fake) needs AI_GATEWAY_API_KEY in the environment.
`;

function writeLine(text = ""): void {
  process.stdout.write(`${text}\n`);
}

/** Quotes a path that the shell would split. */
function shellPath(folderPath: string): string {
  return /\s/.test(folderPath) ? JSON.stringify(folderPath) : folderPath;
}

async function runCli(cliOptions: CliOptions): Promise<number> {
  if (!cliOptions.isFake) {
    const missingVariables = findMissingKeyVariables(process.env);
    if (missingVariables.length > 0) {
      process.stderr.write(
        `Live mode needs ${missingVariables.join(" and ")} in the environment. ` +
          "Set it, or run with --fake.\n",
      );
      return 1;
    }
  }
  const traceDirectory = nodePath.resolve(
    cliOptions.traceDirectory ?? resolveTraceDirectory(PROJECT_NAME),
  );

  writeLine("krino log-triage example · Vercel AI SDK · krino in shadow mode");
  writeLine(
    cliOptions.isFake
      ? "Mode: fake (AI SDK mock language model + krino fake decision provider; no API calls)"
      : `Mode: live (${LIVE_MODEL_IDENTIFIER} via Vercel AI Gateway; Jev decisions)`,
  );
  const task = resolveExampleTask(cliOptions.taskIdentifier);
  writeLine(`Task ${task.taskIdentifier}: ${task.taskText}`);
  writeLine(`Tools offered: ${cliOptions.toolCount}`);
  writeLine();

  const runOptions = { traceDirectory, toolCount: cliOptions.toolCount, task };
  const triageResult = cliOptions.isFake
    ? await runFakeLogTriage(runOptions)
    : await runLiveLogTriage(runOptions);

  const usedToolsText = triageResult.usedToolNames.join(", ") || "none";
  writeLine(`Answer: ${triageResult.answerText}`);
  writeLine();
  writeLine(`Steps: ${triageResult.stepCount} · tools used: ${usedToolsText}`);
  writeLine(`Traces: ${traceDirectory}`);
  writeLine(`Next: pnpm exec krino report --trace-dir ${shellPath(traceDirectory)}`);
  return 0;
}

async function main(argumentList: Array<string>): Promise<number> {
  let cliOptions: CliOptions;
  try {
    cliOptions = parseCliOptions(argumentList);
  } catch (usageError) {
    if (usageError instanceof CliUsageError) {
      process.stderr.write(`${usageError.message}\n\n${USAGE}`);
      return 2;
    }
    throw usageError;
  }
  if (cliOptions.showHelp) {
    process.stdout.write(USAGE);
    return 0;
  }
  return runCli(cliOptions);
}

main(process.argv.slice(2)).then(
  (exitCode) => {
    process.exitCode = exitCode;
  },
  (runError: unknown) => {
    const errorText = runError instanceof Error ? `${runError.name}: ${runError.message}` : "error";
    process.stderr.write(`log-triage failed: ${errorText}\n`);
    process.exitCode = 1;
  },
);
