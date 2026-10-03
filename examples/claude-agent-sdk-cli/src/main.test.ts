import { type SpawnSyncReturns, spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import nodePath from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Runs the built CLI (dist/main.js) the way CI and the README do. turbo builds it before `test`.

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

function runCli(
  argumentList: Array<string>,
  childEnvironment: NodeJS.ProcessEnv = environmentWithoutKeys(),
): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [MAIN_ENTRY, ...argumentList], {
    encoding: "utf8",
    env: childEnvironment,
  });
}

function freshTraceDirectory(): string {
  const isolatedDirectory = process.env.KRINO_TRACE_DIRECTORY;
  if (isolatedDirectory === undefined) {
    throw new Error("trace-isolation.ts must set KRINO_TRACE_DIRECTORY");
  }
  return mkdtempSync(nodePath.join(isolatedDirectory, "cli-"));
}

describe("claude-agent-sdk-cli", () => {
  it("runs with --fake and no API keys, labelled as simulated", () => {
    const traceDirectory = freshTraceDirectory();

    const cliRun = runCli(["--fake", "--trace-dir", traceDirectory]);

    expect(cliRun.stderr).toBe("");
    expect(cliRun.status).toBe(0);
    expect(cliRun.stdout).toContain("simulated");
    expect(cliRun.stdout).toContain("No Claude Agent SDK call was made");
    expect(cliRun.stdout).toContain("REQ-7f3a");
    expect(cliRun.stdout).toContain(`krino report --trace-dir ${traceDirectory}`);
  });

  it("writes to $KRINO_TRACE_DIRECTORY when --trace-dir is not given", () => {
    const traceDirectory = freshTraceDirectory();

    const cliRun = runCli(["--fake"], {
      ...environmentWithoutKeys(),
      KRINO_TRACE_DIRECTORY: traceDirectory,
    });

    expect(cliRun.status).toBe(0);
    expect(cliRun.stdout).toContain(`krino report --trace-dir ${traceDirectory}`);
  });

  it("without --fake and without keys, exits 1 and names each missing variable", () => {
    const cliRun = runCli(["--trace-dir", freshTraceDirectory()]);

    expect(cliRun.status).toBe(1);
    expect(cliRun.stderr).toContain("ANTHROPIC_API_KEY");
    expect(cliRun.stderr).toContain("AI_GATEWAY_API_KEY");
    expect(cliRun.stdout).toBe("");
  });

  it("names only the variable that is missing", () => {
    const placeholderValue = "placeholder-not-a-real-key";

    const cliRun = runCli(["--trace-dir", freshTraceDirectory()], {
      ...environmentWithoutKeys(),
      AI_GATEWAY_API_KEY: placeholderValue,
    });

    expect(cliRun.status).toBe(1);
    expect(cliRun.stderr).toContain("ANTHROPIC_API_KEY");
    expect(cliRun.stderr).not.toContain("AI_GATEWAY_API_KEY");
    expect(cliRun.stderr).not.toContain(placeholderValue);
  });

  it("exits 2 with usage on a bad --tools value", () => {
    const cliRun = runCli(["--fake", "--tools", "7"]);

    expect(cliRun.status).toBe(2);
    expect(cliRun.stderr).toContain("10, 25, 50 or 100");
  });

  it("prints usage with --help", () => {
    const cliRun = runCli(["--help"]);

    expect(cliRun.status).toBe(0);
    expect(cliRun.stdout).toContain("--fake");
    expect(cliRun.stdout).toContain("--tools");
  });
});
