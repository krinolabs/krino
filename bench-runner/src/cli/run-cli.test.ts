import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import nodePath from "node:path";
import { describe, expect, it } from "vitest";
import { createFakeAgentEnvironment } from "../environment/agent-environment.js";
import type { RunBenchTaskInputs, RunObservation } from "../setups/run-bench-task.js";
import { runBenchTask } from "../setups/run-bench-task.js";
import { type CliDependencies, EXIT_CODES, runCli } from "./run-cli.js";

function freshTraceDirectory(): string {
  const isolatedDirectory = process.env.KRINO_TRACE_DIRECTORY;
  if (isolatedDirectory === undefined) {
    throw new Error("trace-isolation.ts must set KRINO_TRACE_DIRECTORY");
  }
  return mkdtempSync(nodePath.join(isolatedDirectory, "cli-"));
}

function captureOutput() {
  const captured = { output: "", error: "" };
  return {
    captured,
    cliOutput: {
      writeOutput: (text: string) => {
        captured.output += text;
      },
      writeError: (text: string) => {
        captured.error += text;
      },
    },
  };
}

/** A real fake run, billed at $0.50 so the spend limit is reached quickly. */
async function expensiveFakeRun(runInputs: RunBenchTaskInputs): Promise<RunObservation> {
  const runObservation = await runBenchTask(runInputs);
  return { ...runObservation, agentCostInUsd: 0.5, spentInUsd: 0.5 };
}

function cliDependencies(overrides: Partial<CliDependencies> = {}): CliDependencies {
  return {
    environment: {},
    workingDirectory: () => process.cwd(),
    now: () => new Date(),
    defaultTraceDirectory: () => freshTraceDirectory(),
    createAgentEnvironment: () => createFakeAgentEnvironment(),
    ...overrides,
  };
}

describe("runCli spend guard", () => {
  it("exits 4 and runs nothing when the estimate is over --max-spend-usd", async () => {
    const traceDirectory = freshTraceDirectory();
    const { captured, cliOutput } = captureOutput();

    const exitCode = await runCli(
      ["--fake", "--repeats", "1", "--max-spend-usd", "0.01", "--trace-dir", traceDirectory],
      cliOutput,
      cliDependencies(),
    );

    expect(exitCode).toBe(EXIT_CODES.refusedOverEstimate);
    expect(captured.error).toMatch(/estimated cost is \$\d+\.\d{2}/);
    expect(captured.error).toContain("--max-spend-usd $0.01");
    expect(captured.error).toContain("--pilot (estimated $");
    expect(captured.output).toBe("");
    expect(readdirSync(traceDirectory)).toEqual([]);
  });

  it("exits 3 at the spend limit, with a clear message and the partial results", async () => {
    const traceDirectory = freshTraceDirectory();
    const outputPath = nodePath.join(traceDirectory, "result.json");
    const { captured, cliOutput } = captureOutput();

    const exitCode = await runCli(
      [
        "--fake",
        "--pilot",
        "--setups",
        "step-zero",
        "--max-spend-usd",
        "1",
        "--trace-dir",
        traceDirectory,
        "--out",
        outputPath,
      ],
      cliOutput,
      cliDependencies({ benchDependencies: { executeRun: expensiveFakeRun } }),
    );

    expect(exitCode).toBe(EXIT_CODES.stoppedAtSpendLimit);
    expect(captured.error).toMatch(
      /estimated cost \$\d+\.\d{2} of --max-spend-usd \$1\.00; 10 runs planned/,
    );
    expect(captured.error).toContain(
      "krino-bench: stopped at the spend limit: spent $1.00 of --max-spend-usd $1.00 after 2 of 10 runs.",
    );
    expect(captured.output.split("\n")[0]).toBe("SIMULATED — not real measurements.");
    expect(captured.output).toContain("STOPPED AT THE SPEND LIMIT");
    const benchResult = JSON.parse(readFileSync(outputPath, "utf8"));
    expect(benchResult.spend).toMatchObject({
      stopReason: "spendLimit",
      finishedRunCount: 2,
      plannedRunCount: 10,
      limitInUsd: 1,
    });
    expect(benchResult.runs).toHaveLength(2);
  });
});
