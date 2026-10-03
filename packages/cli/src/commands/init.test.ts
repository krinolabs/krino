import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import nodePath from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type InitOptions, runInit } from "./init.js";
import { KRINO_CONFIG_FILE_NAME, parseKrinoConfigFile } from "./init-config.js";

let projectFolder = "";

beforeEach(async () => {
  // A space in the folder name, like many Windows user folders.
  const parentFolder = await mkdtemp(nodePath.join(tmpdir(), "krino-init-"));
  projectFolder = nodePath.join(parentFolder, "my shop");
  await mkdir(projectFolder);
});

afterEach(async () => {
  await rm(nodePath.dirname(projectFolder), { recursive: true, force: true, maxRetries: 5 });
});

type InitRun = { exitCode: number; outputText: string; errorText: string };

async function runInitIn(initOptions: Partial<InitOptions> = {}): Promise<InitRun> {
  let outputText = "";
  let errorText = "";
  const exitCode = await runInit(
    { traceDirectory: null, force: false, ...initOptions },
    {
      writeOutput: (text) => {
        outputText += text;
      },
      writeError: (text) => {
        errorText += text;
      },
    },
    {
      workingDirectory: () => projectFolder,
      defaultTraceDirectory: (projectName) => nodePath.join("/default traces", projectName),
    },
  );
  return { exitCode, outputText, errorText };
}

async function writePackageManifest(packageManifest: unknown): Promise<void> {
  await writeFile(
    nodePath.join(projectFolder, "package.json"),
    JSON.stringify(packageManifest, null, 2),
  );
}

async function readConfigText(): Promise<string> {
  return readFile(nodePath.join(projectFolder, KRINO_CONFIG_FILE_NAME), "utf8");
}

/** Every file below the project folder with its content, for before/after comparisons. */
async function snapshotFiles(): Promise<Map<string, string>> {
  const fileNames = await readdir(projectFolder, { recursive: true, withFileTypes: true });
  const fileContents = new Map<string, string>();
  for (const directoryEntry of fileNames) {
    if (directoryEntry.isFile()) {
      const filePath = nodePath.join(directoryEntry.parentPath, directoryEntry.name);
      fileContents.set(
        nodePath.relative(projectFolder, filePath),
        await readFile(filePath, "utf8"),
      );
    }
  }
  return fileContents;
}

describe("krino init", () => {
  it("writes krino.config.json with every mode in shadow and prints the AI SDK snippet", async () => {
    await writePackageManifest({ name: "shop", dependencies: { ai: "7.0.126" } });

    const initRun = await runInitIn();

    expect(initRun.exitCode).toBe(0);
    expect(initRun.errorText).toBe("");
    const configValue: unknown = JSON.parse(await readConfigText());
    expect(configValue).toMatchObject({
      projectName: "shop",
      decisionModes: { toolSelection: "shadow", riskGate: "shadow" },
    });
    expect(initRun.outputText).toContain(`Wrote ${KRINO_CONFIG_FILE_NAME}`);
    expect(initRun.outputText).toContain("Detected host: Vercel AI SDK (ai)");
    expect(initRun.outputText).toContain("@krinolabs/krino/ai-sdk");
    expect(initRun.outputText).not.toContain("@krinolabs/krino/claude-agent-sdk");
  });

  it("prints the resolved default trace folder and leaves traceDirectory out", async () => {
    await writePackageManifest({ name: "shop", dependencies: { ai: "7.0.126" } });

    const initRun = await runInitIn();

    expect(initRun.outputText).toContain(
      `Traces: ${nodePath.join("/default traces", "shop")} (default folder)`,
    );
    expect(parseKrinoConfigFile(await readConfigText())).toEqual({
      parseKind: "valid",
      projectName: "shop",
      traceDirectory: null,
    });
  });

  it("prints the Claude Agent SDK snippet", async () => {
    await writePackageManifest({
      name: "agent",
      devDependencies: { "@anthropic-ai/claude-agent-sdk": "0.3.286" },
    });

    const initRun = await runInitIn();

    expect(initRun.exitCode).toBe(0);
    expect(initRun.outputText).toContain(
      "Detected host: Claude Agent SDK (@anthropic-ai/claude-agent-sdk)",
    );
    expect(initRun.outputText).toContain("@krinolabs/krino/claude-agent-sdk");
    expect(initRun.outputText).not.toContain("@krinolabs/krino/ai-sdk");
  });

  it("prints both snippets when both hosts are installed", async () => {
    await writePackageManifest({
      dependencies: { ai: "7.0.126", "@anthropic-ai/claude-agent-sdk": "0.3.286" },
    });

    const initRun = await runInitIn();

    expect(initRun.exitCode).toBe(0);
    expect(initRun.outputText).toContain("@krinolabs/krino/ai-sdk");
    expect(initRun.outputText).toContain("@krinolabs/krino/claude-agent-sdk");
  });

  it("still writes the config without a host, and says how to add one", async () => {
    await writePackageManifest({ name: "plain", dependencies: { zod: "4.6.5" } });

    const initRun = await runInitIn();

    expect(initRun.exitCode).toBe(0);
    expect(parseKrinoConfigFile(await readConfigText()).parseKind).toBe("valid");
    expect(initRun.outputText).toContain("No host SDK found in package.json");
    expect(initRun.outputText).toContain("npm install ai");
    expect(initRun.outputText).toContain("npm install @anthropic-ai/claude-agent-sdk");
    expect(initRun.outputText).not.toContain("import {");
  });

  it("uses the folder name when package.json has no name", async () => {
    await writePackageManifest({ dependencies: { ai: "7.0.126" } });

    await runInitIn();

    expect(JSON.parse(await readConfigText())).toMatchObject({ projectName: "my shop" });
  });

  it("stores --trace-dir as typed and resolves it from the config file's folder", async () => {
    await writePackageManifest({ name: "shop", dependencies: { ai: "7.0.126" } });

    const initRun = await runInitIn({ traceDirectory: "../shared traces" });

    expect(initRun.exitCode).toBe(0);
    expect(JSON.parse(await readConfigText())).toMatchObject({
      traceDirectory: "../shared traces",
    });
    expect(initRun.outputText).toContain(
      `Traces: ${nodePath.resolve(projectFolder, "../shared traces")}`,
    );
    expect(initRun.outputText).toContain('traceDirectory: "../shared traces"');
  });

  it("never edits source files: only krino.config.json is added", async () => {
    await writePackageManifest({ name: "shop", dependencies: { ai: "7.0.126" } });
    await mkdir(nodePath.join(projectFolder, "src"));
    await writeFile(nodePath.join(projectFolder, "src", "agent.ts"), "export const agent = 1;\n");
    await writeFile(nodePath.join(projectFolder, "tsconfig.json"), "{}\n");
    const filesBefore = await snapshotFiles();

    await runInitIn();

    const filesAfter = await snapshotFiles();
    filesAfter.delete(KRINO_CONFIG_FILE_NAME);
    expect(filesAfter).toEqual(filesBefore);
  });

  it("fails without package.json and writes nothing", async () => {
    const initRun = await runInitIn();

    expect(initRun.exitCode).toBe(1);
    expect(initRun.errorText).toContain("no package.json");
    expect(await readdir(projectFolder)).toEqual([]);
  });

  it("fails on a package.json that is not valid JSON", async () => {
    await writeFile(nodePath.join(projectFolder, "package.json"), "{ nope");

    const initRun = await runInitIn();

    expect(initRun.exitCode).toBe(1);
    expect(initRun.errorText).toContain("package.json is not valid JSON");
    expect(await readdir(projectFolder)).toEqual(["package.json"]);
  });

  it("refuses to overwrite an existing krino.config.json", async () => {
    await writePackageManifest({ name: "shop", dependencies: { ai: "7.0.126" } });
    await writeFile(nodePath.join(projectFolder, KRINO_CONFIG_FILE_NAME), '{"mine":true}');

    const initRun = await runInitIn();

    expect(initRun.exitCode).toBe(1);
    expect(initRun.errorText).toContain("already exists");
    expect(initRun.errorText).toContain("--force");
    expect(await readConfigText()).toBe('{"mine":true}');
  });

  it("overwrites an existing krino.config.json with --force", async () => {
    await writePackageManifest({ name: "shop", dependencies: { ai: "7.0.126" } });
    await writeFile(nodePath.join(projectFolder, KRINO_CONFIG_FILE_NAME), '{"mine":true}');

    const initRun = await runInitIn({ force: true });

    expect(initRun.exitCode).toBe(0);
    expect(JSON.parse(await readConfigText())).toMatchObject({ projectName: "shop" });
  });
});
