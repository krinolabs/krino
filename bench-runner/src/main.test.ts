import { type SpawnSyncReturns, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import nodePath from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Runs the built bin (dist/main.js) the way CI and live verification do. turbo builds it first.

const MAIN_ENTRY = fileURLToPath(new URL("../dist/main.js", import.meta.url));

/** Every variable a live run could read a key from. The child gets none of them. */
const KEY_VARIABLE_NAMES = [
  "AI_GATEWAY_API_KEY",
  "ANTHROPIC_API_KEY",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "VERCEL_OIDC_TOKEN",
];

function environmentWithoutKeys(): NodeJS.ProcessEnv {
  const childEnvironment: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: "1" };
  for (const variableName of KEY_VARIABLE_NAMES) {
    delete childEnvironment[variableName];
  }
  return childEnvironment;
}

function runBin(argumentList: Array<string>): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [MAIN_ENTRY, ...argumentList], {
    encoding: "utf8",
    env: environmentWithoutKeys(),
    timeout: 120_000,
  });
}

function freshTraceDirectory(): string {
  const isolatedDirectory = process.env.KRINO_TRACE_DIRECTORY;
  if (isolatedDirectory === undefined) {
    throw new Error("trace-isolation.ts must set KRINO_TRACE_DIRECTORY");
  }
  return mkdtempSync(nodePath.join(isolatedDirectory, "bin-"));
}

describe("krino-bench bin", () => {
  it("runs --fake --pilot offline, with no API keys", () => {
    const traceDirectory = freshTraceDirectory();
    const outputPath = nodePath.join(traceDirectory, "result.json");

    const benchRun = runBin([
      "--fake",
      "--pilot",
      "--trace-dir",
      traceDirectory,
      "--out",
      outputPath,
    ]);

    expect(benchRun.status, benchRun.stderr).toBe(0);
    expect(benchRun.stdout.split("\n")[0]).toBe("SIMULATED — not real measurements.");
    for (const setupName of ["baseline", "per-step", "step-zero"]) {
      expect(benchRun.stdout).toContain(setupName);
    }
    const benchResult = JSON.parse(readFileSync(outputPath, "utf8"));
    expect(benchResult.mode).toBe("fake");
    expect(benchResult.spend.finishedRunCount).toBe(30);
    expect(benchResult.setups).toHaveLength(3);
    for (const setupResult of benchResult.setups) {
      expect(setupResult.overall.runCount).toBe(10);
      expect(setupResult.overall.failedRunCount).toBe(0);
      expect(setupResult.reportEngine.reportKind).toBe("read");
    }
    const traceFileNames = readdirSync(traceDirectory).filter((fileName) =>
      fileName.endsWith(".jsonl"),
    );
    expect(traceFileNames.length).toBeGreaterThan(0);
  });

  it("prints only JSON with --json", () => {
    const traceDirectory = freshTraceDirectory();

    const benchRun = runBin([
      "--fake",
      "--pilot",
      "--setups",
      "step-zero",
      "--tool-counts",
      "10",
      "--trace-dir",
      traceDirectory,
      "--json",
    ]);

    expect(benchRun.status, benchRun.stderr).toBe(0);
    const benchResult = JSON.parse(benchRun.stdout);
    expect(benchResult.mode).toBe("fake");
    expect(benchResult.simulatedNotice).toBe("SIMULATED — not real measurements.");
  });

  it("refuses live mode without a key and names only the variable", () => {
    const benchRun = runBin(["--pilot", "--trace-dir", freshTraceDirectory()]);

    expect(benchRun.status).toBe(1);
    expect(benchRun.stderr).toContain("AI_GATEWAY_API_KEY");
    expect(benchRun.stdout).toBe("");
  });

  it("exits 2 on bad options", () => {
    const benchRun = runBin(["--pilot", "--repeats", "3"]);

    expect(benchRun.status).toBe(2);
    expect(benchRun.stderr).toContain("Usage: krino-bench");
  });
});
