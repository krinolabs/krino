import { mkdir, writeFile } from "node:fs/promises";
import nodePath from "node:path";
import { findMissingKeyVariables } from "@krinolabs/example-ai-sdk-cli/agent";
import { resolveTraceDirectory } from "@krinolabs/krino";
import {
  type AgentEnvironment,
  createFakeAgentEnvironment,
  createLiveAgentEnvironment,
} from "../environment/agent-environment.js";
import { renderBenchText } from "../result/render-bench-text.js";
import { type BenchDependencies, runBench } from "../run-bench.js";
import { BENCH_PROJECT_NAME } from "../setups/run-bench-task.js";
import { type BenchOptions, BenchUsageError, parseBenchOptions } from "./bench-options.js";

/** Exit codes; documented in bench-runner/README.md. */
export const EXIT_CODES = {
  completed: 0,
  failed: 1,
  usageError: 2,
  stoppedAtSpendLimit: 3,
  refusedOverEstimate: 4,
} as const;

export const USAGE = `Usage: krino-bench [--fake] [--pilot | --repeats N] [--setups baseline,per-step,step-zero]
                   [--tool-counts 10,25,50,100] [--max-spend-usd 20] [--trace-dir <folder>]
                   [--out <file>] [--json]

  --fake           No API keys, no network: the AI SDK mock model and krino's fake decision
                   provider. Output is marked SIMULATED.
  --pilot          A fixed stratified sample: 10 runs per setup and tool count.
  --repeats        Whole cycles: every task runs N times per setup (default 2).
  --setups         baseline (no routing), per-step (prunes every step; bench only),
                   step-zero (krino enforce mode). Default: all three.
  --tool-counts    Tools the agent gets, from the bench catalog (default 100).
  --max-spend-usd  Refuses to start when the estimate is higher; stops when spend reaches it.
  --trace-dir      Where traces go (default: $KRINO_TRACE_DIRECTORY, then ~/.krino/traces/krino-bench).
  --out            The results JSON (default: bench-results-<time>.json in the trace folder).
  --json           Print the results JSON instead of the text comparison.

Live mode (no --fake) needs AI_GATEWAY_API_KEY in the environment.
Exit codes: 0 done, 1 failed, 2 bad options, 3 stopped at the spend limit, 4 estimate over the limit.
`;

export type CliOutput = {
  writeOutput: (text: string) => void;
  writeError: (text: string) => void;
};

export type CliDependencies = {
  environment: Readonly<Record<string, string | undefined>>;
  workingDirectory: () => string;
  now: () => Date;
  /** The default trace folder for a project: `resolveTraceDirectory` from @krinolabs/krino. */
  defaultTraceDirectory: (projectName: string) => string;
  createAgentEnvironment: (isFake: boolean) => AgentEnvironment;
  benchDependencies?: Omit<BenchDependencies, "agentEnvironment" | "now" | "reportProgress">;
};

export function defaultCliDependencies(): CliDependencies {
  return {
    environment: process.env,
    workingDirectory: () => process.cwd(),
    now: () => new Date(),
    defaultTraceDirectory: resolveTraceDirectory,
    createAgentEnvironment: (isFake) =>
      isFake ? createFakeAgentEnvironment() : createLiveAgentEnvironment(),
  };
}

function resultFileName(startedAt: Date): string {
  return `bench-results-${startedAt.toISOString().replace(/[:.]/g, "-")}.json`;
}

async function runParsedCli(
  benchOptions: BenchOptions,
  cliOutput: CliOutput,
  dependencies: CliDependencies,
): Promise<number> {
  if (!benchOptions.isFake) {
    const missingVariables = findMissingKeyVariables(dependencies.environment);
    if (missingVariables.length > 0) {
      cliOutput.writeError(
        `krino-bench: live mode needs ${missingVariables.join(" and ")} in the environment. ` +
          "Set it, or run with --fake.\n",
      );
      return EXIT_CODES.failed;
    }
  }
  const traceDirectory = nodePath.resolve(
    dependencies.workingDirectory(),
    benchOptions.traceDirectory ?? dependencies.defaultTraceDirectory(BENCH_PROJECT_NAME),
  );
  const startedAt = dependencies.now();
  const outcome = await runBench(
    {
      setupNames: benchOptions.setupNames,
      runSelection: benchOptions.runSelection,
      toolCounts: benchOptions.toolCounts,
      maxSpendInUsd: benchOptions.maxSpendInUsd,
      traceDirectory,
    },
    {
      ...dependencies.benchDependencies,
      agentEnvironment: dependencies.createAgentEnvironment(benchOptions.isFake),
      now: dependencies.now,
      reportProgress: (progressLine) => cliOutput.writeError(`${progressLine}\n`),
    },
  );

  const { result } = outcome;
  const outputPath = nodePath.resolve(
    dependencies.workingDirectory(),
    benchOptions.outputPath ?? nodePath.join(traceDirectory, resultFileName(startedAt)),
  );
  await mkdir(nodePath.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  cliOutput.writeOutput(
    benchOptions.printJson ? `${JSON.stringify(result, null, 2)}\n` : renderBenchText(result),
  );
  cliOutput.writeError(`krino-bench: results written to ${outputPath}\n`);
  return EXIT_CODES.completed;
}

/** Runs `krino-bench` and returns the exit code. */
export async function runCli(
  argumentList: Array<string>,
  cliOutput: CliOutput,
  dependencies: CliDependencies = defaultCliDependencies(),
): Promise<number> {
  let benchOptions: BenchOptions;
  try {
    benchOptions = parseBenchOptions(argumentList);
  } catch (usageError) {
    if (usageError instanceof BenchUsageError) {
      cliOutput.writeError(`krino-bench: ${usageError.message}\n\n${USAGE}`);
      return EXIT_CODES.usageError;
    }
    throw usageError;
  }
  if (benchOptions.showHelp) {
    cliOutput.writeOutput(USAGE);
    return EXIT_CODES.completed;
  }
  return runParsedCli(benchOptions, cliOutput, dependencies);
}
