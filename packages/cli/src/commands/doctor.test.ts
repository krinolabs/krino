import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import nodePath from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTextStyle } from "../terminal/text-style.js";
import {
  type DoctorDependencies,
  type DoctorOptions,
  renderDoctorText,
  runDoctor,
} from "./doctor.js";
import { probeFileSystemFromDisk } from "./doctor-checks.js";
import { buildKrinoConfigFile, KRINO_CONFIG_FILE_NAME } from "./init-config.js";

const NOW = new Date("2026-10-03T12:00:00.000Z");
const SECRET_KEY = "sk-doctor-SENTINEL-0123456789";

let projectFolder = "";

const tokenUsage = {
  inputTokens: 100,
  outputTokens: 50,
  cacheReadTokens: 800,
  cacheWriteTokens: 100,
};

function stepLine(runIdentifier: string, stepNumber: number, decisionModelVersion: string): string {
  return JSON.stringify({
    traceSchemaVersion: 1,
    recordType: "agentStep",
    projectName: "shop",
    runIdentifier,
    stepNumber,
    hostName: "ai-sdk",
    hostSdkVersion: "7.0.126",
    modelIdentifier: "anthropic/claude-sonnet-5-5",
    availableToolNames: ["search"],
    chosenToolNames: ["search"],
    tokenUsage,
    costInUsd: 0.01,
    latencyInMilliseconds: 800,
    recordedAt: "2026-10-03T10:00:00.000Z",
    decisions: [
      {
        decisionKind: "toolSelection",
        decisionMode: "shadow",
        decisionStatus: "answered",
        suggestedChoice: "search",
        appliedChoice: "search",
        probability: 0.9,
        decisionModelVersion,
        latencyInMilliseconds: 200,
        decisionCostInUsd: 0.001,
      },
    ],
    contentHash: null,
  });
}

function summaryLine(runIdentifier: string): string {
  return JSON.stringify({
    traceSchemaVersion: 1,
    recordType: "runSummary",
    projectName: "shop",
    runIdentifier,
    hostName: "ai-sdk",
    hostSdkVersion: "7.0.126",
    modelIdentifier: "anthropic/claude-sonnet-5-5",
    totalTokenUsage: tokenUsage,
    totalCostInUsd: 0.02,
    stepCount: 2,
    usedToolNames: ["search"],
    toolSelectionAgreement: true,
    recordedAt: "2026-10-03T10:00:05.000Z",
  });
}

async function writeTraces(traceFolder: string, lines: Array<string>): Promise<void> {
  await mkdir(traceFolder, { recursive: true });
  await writeFile(nodePath.join(traceFolder, "traces-2026-10-03.jsonl"), `${lines.join("\n")}\n`);
}

async function installPackage(packageName: string, version: string): Promise<void> {
  const packageFolder = nodePath.join(projectFolder, "node_modules", ...packageName.split("/"));
  await mkdir(packageFolder, { recursive: true });
  await writeFile(nodePath.join(packageFolder, "package.json"), JSON.stringify({ version }));
}

async function writeConfig(traceDirectory: string | null): Promise<void> {
  await writeFile(
    nodePath.join(projectFolder, KRINO_CONFIG_FILE_NAME),
    JSON.stringify(buildKrinoConfigFile({ projectName: "shop", traceDirectory })),
  );
}

/** A project where every check passes: config, ai 7.0.126, key set, healthy recent traces. */
async function writeHealthyProject(): Promise<void> {
  await writeConfig("traces");
  await installPackage("ai", "7.0.126");
  await writeTraces(nodePath.join(projectFolder, "traces"), [
    stepLine("run-1", 0, "jev-1"),
    stepLine("run-1", 1, "jev-1"),
    summaryLine("run-1"),
  ]);
}

type DoctorRun = { exitCode: number; outputText: string };

async function runDoctorWith(
  dependencyOverrides: Partial<DoctorDependencies> = {},
  doctorOptions: Partial<DoctorOptions> = {},
): Promise<DoctorRun> {
  let outputText = "";
  const exitCode = await runDoctor(
    { projectName: null, traceDirectory: null, ...doctorOptions },
    {
      writeOutput: (text) => {
        outputText += text;
      },
      isTerminal: false,
    },
    {
      environment: { AI_GATEWAY_API_KEY: SECRET_KEY },
      workingDirectory: () => projectFolder,
      nodeVersion: "22.12.0",
      defaultTraceDirectory: (projectName) =>
        nodePath.join(projectFolder, "default-traces", projectName),
      now: () => NOW,
      probeFileSystem: probeFileSystemFromDisk,
      ...dependencyOverrides,
    },
  );
  return { exitCode, outputText };
}

function statusOf(outputText: string, checkName: string): string | null {
  const checkLine = outputText
    .split("\n")
    .find(
      (outputLine) => outputLine.includes(`  ${checkName}  `) || outputLine.endsWith(checkName),
    );
  return /\b(PASS|WARN|FAIL|SKIP)\b/.exec(checkLine ?? "")?.[1] ?? null;
}

beforeEach(async () => {
  // A space in the folder name, like many Windows user folders.
  projectFolder = nodePath.join(await mkdtemp(nodePath.join(tmpdir(), "krino-doctor-")), "my shop");
  await mkdir(projectFolder);
});

afterEach(async () => {
  await rm(nodePath.dirname(projectFolder), { recursive: true, force: true, maxRetries: 5 });
});

describe("krino doctor exit codes", () => {
  it("exits 0 when every check passes", async () => {
    await writeHealthyProject();

    const doctorRun = await runDoctorWith();

    expect(doctorRun.outputText).not.toContain("WARN");
    expect(doctorRun.outputText).not.toContain("FAIL");
    expect(doctorRun.outputText).not.toContain("fix:");
    expect(doctorRun.outputText).toContain("0 warn, 0 fail");
    expect(doctorRun.exitCode).toBe(0);
  });

  it("exits 0 with warnings, and prints a fix line for each", async () => {
    await writeHealthyProject();

    const doctorRun = await runDoctorWith({ environment: {} });

    expect(statusOf(doctorRun.outputText, "AI_GATEWAY_API_KEY")).toBe("WARN");
    expect(doctorRun.outputText).toContain("fix: Set AI_GATEWAY_API_KEY");
    expect(doctorRun.exitCode).toBe(0);
  });

  it("exits 1 on a failing Node version", async () => {
    await writeHealthyProject();

    const doctorRun = await runDoctorWith({ nodeVersion: "20.11.0" });

    expect(statusOf(doctorRun.outputText, "Node.js")).toBe("FAIL");
    expect(doctorRun.exitCode).toBe(1);
  });

  it("exits 1 when ai is outside the tested range", async () => {
    await writeHealthyProject();
    await installPackage("ai", "6.0.40");

    const doctorRun = await runDoctorWith();

    expect(statusOf(doctorRun.outputText, "ai")).toBe("FAIL");
    expect(doctorRun.exitCode).toBe(1);
  });

  it("exits 0 when the Claude Agent SDK is not the tested version", async () => {
    await writeHealthyProject();
    await installPackage("@anthropic-ai/claude-agent-sdk", "0.3.290");

    const doctorRun = await runDoctorWith();

    expect(statusOf(doctorRun.outputText, "@anthropic-ai/claude-agent-sdk")).toBe("WARN");
    expect(doctorRun.exitCode).toBe(0);
  });

  it("exits 1 on an unreadable krino.config.json", async () => {
    await writeHealthyProject();
    await writeFile(nodePath.join(projectFolder, KRINO_CONFIG_FILE_NAME), "{broken");

    const doctorRun = await runDoctorWith();

    expect(statusOf(doctorRun.outputText, KRINO_CONFIG_FILE_NAME)).toBe("FAIL");
    expect(doctorRun.exitCode).toBe(1);
  });

  it("exits 1 when the trace folder cannot be written", async () => {
    await writeHealthyProject();

    const doctorRun = await runDoctorWith({
      probeFileSystem: {
        ...probeFileSystemFromDisk,
        writeProbe: async () => {
          throw Object.assign(new Error("EPERM: operation not permitted"), { code: "EPERM" });
        },
      },
    });

    expect(statusOf(doctorRun.outputText, "Trace folder")).toBe("FAIL");
    expect(doctorRun.exitCode).toBe(1);
  });
});

describe("krino doctor output", () => {
  it("prints only 'present' for the gateway key, never its value", async () => {
    await writeHealthyProject();

    const doctorRun = await runDoctorWith();

    expect(doctorRun.outputText).toMatch(/AI_GATEWAY_API_KEY\s+present/);
    expect(doctorRun.outputText).not.toContain("SENTINEL");
  });

  it("warns about the fake provider, the cut-off rate and cache health from recent traces", async () => {
    await writeConfig("traces");
    await installPackage("ai", "7.0.126");
    const cutOffStep = JSON.parse(stepLine("run-2", 0, "jev-1"));
    cutOffStep.decisions[0].decisionStatus = "cutOff";
    const coldSummary = JSON.parse(summaryLine("run-1"));
    coldSummary.totalTokenUsage = { ...tokenUsage, inputTokens: 900, cacheReadTokens: 100 };
    await writeTraces(nodePath.join(projectFolder, "traces"), [
      stepLine("run-1", 0, "fake-decision-model-1"),
      JSON.stringify(cutOffStep),
      JSON.stringify(coldSummary),
    ]);

    const doctorRun = await runDoctorWith();

    expect(statusOf(doctorRun.outputText, "Decision provider")).toBe("WARN");
    expect(statusOf(doctorRun.outputText, "Cut-offs")).toBe("WARN");
    expect(statusOf(doctorRun.outputText, "Cache health")).toBe("WARN");
    expect(doctorRun.exitCode).toBe(0);
  });

  it("warns, not fails, when there are no recent traces and no config", async () => {
    const doctorRun = await runDoctorWith();

    expect(statusOf(doctorRun.outputText, KRINO_CONFIG_FILE_NAME)).toBe("WARN");
    expect(statusOf(doctorRun.outputText, "Recent traces")).toBe("WARN");
    expect(statusOf(doctorRun.outputText, "Host SDK")).toBe("WARN");
    expect(statusOf(doctorRun.outputText, "Decision provider")).toBe("SKIP");
    expect(statusOf(doctorRun.outputText, "Cut-offs")).toBe("SKIP");
    expect(statusOf(doctorRun.outputText, "Cache health")).toBe("SKIP");
    expect(doctorRun.outputText).toContain("3 skipped");
    expect(doctorRun.exitCode).toBe(0);
  });

  it("does not count skips as passes, and skips alone keep exit code 0", async () => {
    await writeConfig("traces");
    await installPackage("ai", "7.0.126");
    // One single-step run, no decisions: nothing for the provider, cut-off or cache checks.
    const quietStep = JSON.parse(stepLine("run-1", 0, "jev-1"));
    quietStep.decisions = [];
    await writeTraces(nodePath.join(projectFolder, "traces"), [JSON.stringify(quietStep)]);

    const doctorRun = await runDoctorWith();

    const passLineCount = doctorRun.outputText
      .split("\n")
      .filter((outputLine) => /^\s+PASS\s/.test(outputLine)).length;
    expect(doctorRun.outputText).toContain(`${passLineCount} pass, 0 warn, 0 fail, 3 skipped`);
    expect(statusOf(doctorRun.outputText, "Decision provider")).toBe("SKIP");
    expect(statusOf(doctorRun.outputText, "Cache health")).toBe("SKIP");
    expect(doctorRun.outputText).not.toContain("fix:");
    expect(doctorRun.exitCode).toBe(0);
  });

  it("renders skips dimmed", () => {
    const renderedText = renderDoctorText(
      [
        { checkName: "Node.js", checkStatus: "pass", detail: "22.12.0", fixLine: null },
        { checkName: "Cache health", checkStatus: "skip", detail: "nothing yet", fixLine: null },
      ],
      createTextStyle(true),
    );
    const skipLine = renderedText.split("\n").find((outputLine) => outputLine.includes("SKIP"));
    expect(skipLine).toBe("\u001b[2m  SKIP  Cache health  nothing yet\u001b[22m");
    expect(renderedText).toContain("1 pass, 0 warn, 0 fail, 1 skipped");
  });
});

describe("krino doctor trace folder", () => {
  it("resolves a relative traceDirectory from the config file's folder, not the working directory", async () => {
    await writeHealthyProject();
    const nestedFolder = nodePath.join(projectFolder, "src", "agents");
    await mkdir(nestedFolder, { recursive: true });

    const doctorRun = await runDoctorWith({ workingDirectory: () => nestedFolder });

    expect(doctorRun.outputText).toContain(`${nodePath.join(projectFolder, "traces")} is writable`);
    expect(statusOf(doctorRun.outputText, "Recent traces")).toBe("PASS");
    expect(statusOf(doctorRun.outputText, "ai")).toBe("PASS");
  });

  it("warns when the runtime would resolve the relative traceDirectory to another folder", async () => {
    await writeHealthyProject();
    const nestedFolder = nodePath.join(projectFolder, "src", "agents");
    await mkdir(nestedFolder, { recursive: true });

    const doctorRun = await runDoctorWith({ workingDirectory: () => nestedFolder });

    expect(statusOf(doctorRun.outputText, "Config trace folder")).toBe("WARN");
    expect(doctorRun.outputText).toContain(nodePath.join(nestedFolder, "traces"));
    expect(doctorRun.outputText).toContain(
      "fix: Use an absolute path or set KRINO_TRACE_DIRECTORY so the runtime and the CLI use the same folder.",
    );
    expect(doctorRun.exitCode).toBe(0);
  });

  it("passes the folder match when run from the config file's folder", async () => {
    await writeHealthyProject();

    const doctorRun = await runDoctorWith();

    expect(statusOf(doctorRun.outputText, "Config trace folder")).toBe("PASS");
  });

  it("passes the folder match for an absolute traceDirectory from any folder", async () => {
    const absoluteTraceFolder = nodePath.join(projectFolder, "abs traces");
    await writeConfig(absoluteTraceFolder);
    const nestedFolder = nodePath.join(projectFolder, "src");
    await mkdir(nestedFolder, { recursive: true });

    const doctorRun = await runDoctorWith({ workingDirectory: () => nestedFolder });

    expect(statusOf(doctorRun.outputText, "Config trace folder")).toBe("PASS");
  });

  it("leaves the folder match out when the config has no traceDirectory", async () => {
    await writeConfig(null);

    const doctorRun = await runDoctorWith();

    expect(doctorRun.outputText).not.toContain("Config trace folder");
  });

  it("resolves a traceDirectory with platform separators and spaces", async () => {
    const typedTraceDirectory = ["..", "shared traces", "shop"].join(nodePath.sep);
    await writeConfig(typedTraceDirectory);
    const sharedFolder = nodePath.resolve(projectFolder, typedTraceDirectory);
    await writeTraces(sharedFolder, [stepLine("run-1", 0, "jev-1")]);

    const doctorRun = await runDoctorWith();

    expect(doctorRun.outputText).toContain(`${sharedFolder} is writable`);
    expect(statusOf(doctorRun.outputText, "Recent traces")).toBe("PASS");
  });

  it("lets --trace-dir win over the config, resolved from the working directory", async () => {
    await writeHealthyProject();
    await writeTraces(nodePath.join(projectFolder, "other traces"), [
      stepLine("run-9", 0, "jev-1"),
    ]);

    const doctorRun = await runDoctorWith({}, { traceDirectory: "other traces" });

    expect(doctorRun.outputText).toContain(
      `${nodePath.join(projectFolder, "other traces")} is writable`,
    );
    expect(doctorRun.outputText).toContain("1 runs");
  });

  it("lets --project win over the config's project name", async () => {
    await writeHealthyProject();

    const doctorRun = await runDoctorWith({}, { projectName: "someone-else" });

    expect(statusOf(doctorRun.outputText, "Recent traces")).toBe("WARN");
    expect(doctorRun.outputText).toContain('none are for project "someone-else"');
  });

  it("falls back to KRINO_TRACE_DIRECTORY without a config", async () => {
    const environmentFolder = nodePath.join(projectFolder, "env traces");
    await writeTraces(environmentFolder, [stepLine("run-1", 0, "jev-1")]);

    const doctorRun = await runDoctorWith({
      environment: { KRINO_TRACE_DIRECTORY: environmentFolder },
    });

    expect(doctorRun.outputText).toContain(`${environmentFolder} is writable`);
    expect(statusOf(doctorRun.outputText, "Recent traces")).toBe("PASS");
  });

  it("ignores traces older than 7 days", async () => {
    await writeHealthyProject();

    const doctorRun = await runDoctorWith({ now: () => new Date("2026-10-20T12:00:00.000Z") });

    expect(statusOf(doctorRun.outputText, "Recent traces")).toBe("WARN");
  });
});
