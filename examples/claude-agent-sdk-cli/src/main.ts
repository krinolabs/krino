import nodePath from "node:path";
import { resolveTraceDirectory } from "@krinolabs/krino";
import { type CliOptions, CliUsageError, parseCliOptions } from "./cli-options.js";
import { findMissingKeyVariables, runLiveLogTriage } from "./live-run.js";
import { LIVE_MODEL_IDENTIFIER, PROJECT_NAME } from "./log-triage.js";
import { DEFAULT_TASK_IDENTIFIER, EXAMPLE_TASKS, resolveExampleTask } from "./log-triage-tasks.js";
import { runSimulatedLogTriage, SIMULATED_LABEL } from "./simulated-run.js";

const TASK_LINES = EXAMPLE_TASKS.map(
  (exampleTask) => `                  ${exampleTask.taskIdentifier}: ${exampleTask.summary}`,
).join("\n");

const USAGE = `Usage: pnpm start [--fake] [--task <id>] [--tools 10|25|50|100] [--trace-dir <folder>]

  --fake        No API keys, no network: a simulated Claude Agent SDK message stream and
                krino's fake decision provider.
  --task        Which bench task to run (default ${DEFAULT_TASK_IDENTIFIER}):
${TASK_LINES}
  --tools       How many bench catalog tools the agent gets (default 100).
  --trace-dir   Where krino writes traces (default: $KRINO_TRACE_DIRECTORY, then ~/.krino).

Live mode (no --fake) needs ANTHROPIC_API_KEY and AI_GATEWAY_API_KEY in the environment.
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
          "Set them, or run with --fake.\n",
      );
      return 1;
    }
  }
  const traceDirectory = nodePath.resolve(
    cliOptions.traceDirectory ?? resolveTraceDirectory(PROJECT_NAME),
  );
  const label = cliOptions.isFake ? `${SIMULATED_LABEL} ` : "";

  writeLine("krino log-triage example · Claude Agent SDK · krino in shadow mode");
  if (cliOptions.isFake) {
    writeLine(
      `Mode: ${SIMULATED_LABEL} scripted Agent SDK message stream + krino fake decision provider.`,
    );
    writeLine(`${SIMULATED_LABEL} No Claude Agent SDK call was made; no API calls.`);
  } else {
    writeLine(`Mode: live (${LIVE_MODEL_IDENTIFIER} via the Claude Agent SDK; Jev decisions)`);
  }
  const task = resolveExampleTask(cliOptions.taskIdentifier);
  writeLine(`Task ${task.taskIdentifier}: ${task.taskText}`);
  writeLine(`Tools offered: ${cliOptions.toolCount}`);
  writeLine();

  const runOptions = { traceDirectory, toolCount: cliOptions.toolCount, task };
  const triageResult = cliOptions.isFake
    ? await runSimulatedLogTriage(runOptions)
    : await runLiveLogTriage(runOptions);

  const usedToolsText = triageResult.usedToolNames.join(", ") || "none";
  const costText =
    triageResult.totalCostInUsd === null ? "n/a" : `$${triageResult.totalCostInUsd.toFixed(4)}`;
  writeLine(`${label}Answer: ${triageResult.answerText}`);
  writeLine();
  writeLine(
    `${label}Turns: ${triageResult.turnCount ?? "n/a"} · tools used: ${usedToolsText} · ` +
      `cost: ${costText}`,
  );
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
