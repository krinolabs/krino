import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import nodePath from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_MODEL_PRICES } from "@krinolabs/krino";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { KrinoReport } from "../report/report-types.js";
import {
  createReport,
  DEFAULT_TOKENS_PER_TOOL_DEFINITION,
  defaultReportDependencies,
  type ReportDependencies,
  type ReportOptions,
  runReport,
} from "./report.js";

const FIXTURE_HOME = fileURLToPath(new URL("../report/fixtures/home", import.meta.url));
const FIXTURE_NOW = new Date("2026-10-02T12:00:00.000Z");
const ANSI_ESCAPE = "\u001b[";

/** The file sink's default folder rule, rooted at `homeFolder`. */
function defaultTraceDirectoryUnder(homeFolder: string): (projectName: string) => string {
  return (projectName) => nodePath.join(homeFolder, ".krino", "traces", projectName);
}

function fixtureDependencies(overrides: Partial<ReportDependencies> = {}): ReportDependencies {
  return {
    environment: {},
    defaultTraceDirectory: defaultTraceDirectoryUnder(FIXTURE_HOME),
    workingDirectory: () => FIXTURE_HOME,
    now: () => FIXTURE_NOW,
    modelPrices: DEFAULT_MODEL_PRICES,
    ...overrides,
  };
}

/** Fixture paths differ per machine; snapshots use `<home>` and forward slashes. */
function portablePath(text: string): string {
  return text.replaceAll(FIXTURE_HOME, "<home>").replaceAll("\\", "/");
}

type CapturedRun = { exitCode: number; output: string; errorOutput: string };

/** `--trace-dir` and `--tokens-per-tool` are optional in tests, as on the command line. */
type TestReportOptions = Omit<ReportOptions, "traceDirectory" | "tokensPerToolText"> & {
  traceDirectory?: string | null;
  tokensPerToolText?: string;
};

const OPTION_DEFAULTS = {
  traceDirectory: null,
  tokensPerToolText: String(DEFAULT_TOKENS_PER_TOOL_DEFINITION),
};

async function runCaptured(
  reportOptions: TestReportOptions & { json: boolean },
  options: { isTerminal?: boolean; dependencies?: Partial<ReportDependencies> } = {},
): Promise<CapturedRun> {
  let output = "";
  let errorOutput = "";
  const exitCode = await runReport(
    { ...OPTION_DEFAULTS, ...reportOptions },
    {
      writeOutput: (text) => {
        output += text;
      },
      writeError: (text) => {
        errorOutput += text;
      },
      isTerminal: options.isTerminal,
    },
    fixtureDependencies(options.dependencies),
  );
  return { exitCode, output, errorOutput };
}

async function reportFor(
  reportOptions: TestReportOptions,
  dependencyOverrides: Partial<ReportDependencies> = {},
): Promise<KrinoReport> {
  const reportResult = await createReport(
    { ...OPTION_DEFAULTS, ...reportOptions },
    fixtureDependencies(dependencyOverrides),
  );
  if (reportResult.resultKind !== "report") {
    throw new Error(`expected a report, got: ${reportResult.message}`);
  }
  return {
    ...reportResult.report,
    filters: {
      ...reportResult.report.filters,
      traceDirectory: portablePath(reportResult.report.filters.traceDirectory),
    },
  };
}

const temporaryFolders: Array<string> = [];

function temporaryTraceFolder(fileContents: Record<string, string>): string {
  const folderPath = mkdtempSync(nodePath.join(tmpdir(), "krino-report-test-"));
  temporaryFolders.push(folderPath);
  for (const [fileName, fileContent] of Object.entries(fileContents)) {
    writeFileSync(nodePath.join(folderPath, fileName), fileContent);
  }
  return folderPath;
}

afterAll(() => {
  for (const folderPath of temporaryFolders) {
    rmSync(folderPath, { recursive: true, force: true, maxRetries: 5 });
  }
});

describe("krino report on the fixture trace folders (both hosts, cut-offs, bad lines)", () => {
  it("prints the text report for every project", async () => {
    const capturedRun = await runCaptured({ projectName: null, sinceText: "7d", json: false });
    expect(capturedRun.exitCode).toBe(0);
    expect(capturedRun.errorOutput).toBe("");
    expect(portablePath(capturedRun.output)).toMatchSnapshot();
  });

  it("prints the JSON report for every project", async () => {
    const capturedRun = await runCaptured({ projectName: null, sinceText: "7d", json: true });
    expect(capturedRun.exitCode).toBe(0);
    const report = JSON.parse(capturedRun.output) as KrinoReport;
    report.filters.traceDirectory = portablePath(report.filters.traceDirectory);
    expect(report).toMatchSnapshot();
  });

  it("prints the JSON report for one project", async () => {
    const report = await reportFor({ projectName: "fixture-project", sinceText: "7d" });
    expect(report).toMatchSnapshot();
    expect(report.records.projectNames).toEqual(["fixture-project"]);
    expect(report.filters.traceDirectory).toBe("<home>/.krino/traces/fixture-project");
  });

  it("skips and counts every bad line by reason", async () => {
    const report = await reportFor({ projectName: "fixture-project", sinceText: "7d" });
    expect(report.lines).toEqual({
      readLineCount: 26,
      validLineCount: 21,
      skippedLineCount: 5,
      invalidJsonLineCount: 1,
      unsupportedSchemaVersionLineCount: 2,
      invalidShapeLineCount: 2,
    });
  });

  it("labels agreement per host with that host's metric", async () => {
    const report = await reportFor({ projectName: "fixture-project", sinceText: "7d" });
    const shadowToolSelection = report.decisions.find(
      (decisionReport) =>
        decisionReport.decisionKind === "toolSelection" && decisionReport.decisionMode === "shadow",
    );
    expect(
      shadowToolSelection?.agreementByHost.map((hostAgreement) => [
        hostAgreement.hostName,
        hostAgreement.metric,
        hostAgreement.agreeingCount,
        hostAgreement.comparedCount,
      ]),
    ).toEqual([
      ["ai-sdk", "stepToolsInSuggestedSet", 3, 4],
      ["claude-agent-sdk", "runToolsInSuggestedSet", 1, 2],
    ]);
  });

  it("counts cut-offs across decision kinds", async () => {
    const report = await reportFor({ projectName: "fixture-project", sinceText: "7d" });
    expect(report.cutOffs).toEqual({ cutOffCount: 2, callCount: 12, cutOffShare: 0.166667 });
    expect(report.nextStep).toContain("cut off");
  });

  it("prices the saving with cache read and write tokens", async () => {
    // Hand-computed with 150 tokens per tool.
    const report = await reportFor({
      projectName: "fixture-project",
      sinceText: "7d",
      tokensPerToolText: "150",
    });
    const shadowSaving = report.decisions.find(
      (decisionReport) =>
        decisionReport.decisionKind === "toolSelection" && decisionReport.decisionMode === "shadow",
    )?.costSavedIfEnforced;
    // Hand-computed from the fixtures: 4 runs, 150 tokens per removed tool, Haiku and Sonnet prices.
    expect(shadowSaving).toMatchObject({
      estimateKind: "estimated",
      decisionCostInUsd: 0.0013,
      suggestionRunCount: 4,
    });
    if (shadowSaving?.estimateKind !== "estimated" || shadowSaving.grossSavingInUsd === null) {
      throw new Error("expected an estimated saving");
    }
    expect(shadowSaving.grossSavingInUsd).toBeCloseTo(0.00365, 5);
  });

  it("leaves out files and records from before --since", async () => {
    const lastWeek = await reportFor({ projectName: "fixture-project", sinceText: "7d" });
    const lastTwoMonths = await reportFor({ projectName: "fixture-project", sinceText: "60d" });
    expect(lastWeek.filters.traceFileCount).toBe(2);
    expect(lastTwoMonths.filters.traceFileCount).toBe(3);
    expect(lastTwoMonths.records.runCount).toBe(lastWeek.records.runCount + 1);
    const sinceOctoberFirst = await reportFor({
      projectName: "fixture-project",
      sinceText: "2026-10-01",
    });
    expect(sinceOctoberFirst.records.agentStepCount).toBe(8);
  });

  it("reads $KRINO_TRACE_DIRECTORY and still filters by --project", async () => {
    const environment = {
      KRINO_TRACE_DIRECTORY: nodePath.join(FIXTURE_HOME, ".krino", "traces", "fixture-project"),
    };
    const sameProject = await reportFor(
      { projectName: "fixture-project", sinceText: "7d" },
      { environment },
    );
    const otherProject = await reportFor(
      { projectName: "other-project", sinceText: "7d" },
      { environment },
    );
    expect(sameProject.records.agentStepCount).toBe(14);
    expect(otherProject.records.agentStepCount).toBe(0);
    expect(otherProject.lines.readLineCount).toBe(26);
    expect(otherProject.nextStep).toBe(
      "No trace records match the filters: try a longer --since or check --project.",
    );
  });

  it("reports an empty folder without failing", async () => {
    const capturedRun = await runCaptured({
      projectName: "never-ran",
      sinceText: "7d",
      json: true,
    });
    expect(capturedRun.exitCode).toBe(0);
    const report = JSON.parse(capturedRun.output) as KrinoReport;
    expect(report.lines.readLineCount).toBe(0);
    expect(report.decisions).toEqual([]);
    expect(report.nextStep).toMatch(/^No traces found in /);
  });
});

describe("trace folders whose path has glob characters", () => {
  const FIXTURE_PROJECT_FOLDER = nodePath.join(FIXTURE_HOME, ".krino", "traces", "fixture-project");

  /** A copy of the fixture home under `<temp>/krino home [old] copy/`. */
  function bracketedHome(): string {
    const parentFolder = mkdtempSync(nodePath.join(tmpdir(), "krino-report-glob-"));
    temporaryFolders.push(parentFolder);
    const homeFolder = nodePath.join(parentFolder, "krino home [old] copy");
    const projectFolder = nodePath.join(homeFolder, ".krino", "traces", "fixture-project");
    mkdirSync(projectFolder, { recursive: true });
    cpSync(FIXTURE_PROJECT_FOLDER, projectFolder, { recursive: true });
    return homeFolder;
  }

  it("reads every listed file even when the folder path has '[', ']' and a space", async () => {
    const homeFolder = bracketedHome();
    const expected = await reportFor({ projectName: "fixture-project", sinceText: "7d" });
    const fromBracketedHome = await reportFor(
      { projectName: "fixture-project", sinceText: "7d" },
      { defaultTraceDirectory: defaultTraceDirectoryUnder(homeFolder) },
    );
    expect(fromBracketedHome.filters.traceDirectory).toContain("krino home [old] copy");
    expect(fromBracketedHome.filters.traceFileCount).toBe(2);
    expect(fromBracketedHome.lines).toEqual(expected.lines);
    expect(fromBracketedHome.records).toEqual(expected.records);
    expect(fromBracketedHome.decisions).toEqual(expected.decisions);
  });

  it("reads a bracketed folder through every project folder under the traces root", async () => {
    const homeFolder = bracketedHome();
    const report = await reportFor(
      { projectName: null, sinceText: "7d" },
      { defaultTraceDirectory: defaultTraceDirectoryUnder(homeFolder) },
    );
    expect(report.lines.readLineCount).toBe(26);
    expect(report.records.agentStepCount).toBe(14);
  });
});

describe("which trace folder is read", () => {
  const FIXTURE_PROJECT_FOLDER = nodePath.join(FIXTURE_HOME, ".krino", "traces", "fixture-project");
  const OTHER_PROJECT_FOLDER = nodePath.join(FIXTURE_HOME, ".krino", "traces", "other-project");

  it("uses --trace-dir before $KRINO_TRACE_DIRECTORY and the default folder", async () => {
    const report = await reportFor(
      { projectName: null, sinceText: "7d", traceDirectory: OTHER_PROJECT_FOLDER },
      { environment: { KRINO_TRACE_DIRECTORY: FIXTURE_PROJECT_FOLDER } },
    );
    expect(report.filters.traceDirectory).toBe("<home>/.krino/traces/other-project");
    expect(report.records.projectNames).toEqual(["other-project"]);
  });

  it("uses $KRINO_TRACE_DIRECTORY before the default folder", async () => {
    const report = await reportFor(
      { projectName: null, sinceText: "7d" },
      { environment: { KRINO_TRACE_DIRECTORY: OTHER_PROJECT_FOLDER } },
    );
    expect(report.filters.traceDirectory).toBe("<home>/.krino/traces/other-project");
    expect(report.records.projectNames).toEqual(["other-project"]);
  });

  it("uses resolveTraceDirectory from @krinolabs/krino for the default folder", async () => {
    vi.stubEnv("KRINO_TRACE_DIRECTORY", "");
    vi.stubEnv("XDG_STATE_HOME", "");
    vi.stubEnv("HOME", FIXTURE_HOME);
    vi.stubEnv("USERPROFILE", FIXTURE_HOME);
    try {
      const reportResult = await createReport(
        { ...OPTION_DEFAULTS, projectName: "fixture-project", sinceText: "7d" },
        { ...defaultReportDependencies(), now: () => FIXTURE_NOW },
      );
      if (reportResult.resultKind !== "report") {
        throw new Error(reportResult.message);
      }
      expect(portablePath(reportResult.report.filters.traceDirectory)).toBe(
        "<home>/.krino/traces/fixture-project",
      );
      expect(reportResult.report.records.agentStepCount).toBe(14);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("uses the default folder when neither is set", async () => {
    const report = await reportFor({ projectName: null, sinceText: "7d" });
    expect(report.filters.traceDirectory).toBe("<home>/.krino/traces");
    expect(report.records.projectNames).toEqual(["fixture-project", "other-project"]);
  });

  it("resolves a relative --trace-dir against the working directory and filters by --project", async () => {
    const report = await reportFor({
      projectName: "other-project",
      sinceText: "7d",
      traceDirectory: nodePath.join(".krino", "traces", "fixture-project"),
    });
    expect(report.filters.traceDirectory).toBe("<home>/.krino/traces/fixture-project");
    expect(report.lines.readLineCount).toBe(26);
    expect(report.records.agentStepCount).toBe(0);
  });
});

describe("krino report options and failures", () => {
  it("defaults to 175 tokens per tool and labels the saving an estimate", async () => {
    const report = await reportFor({ projectName: "fixture-project", sinceText: "7d" });
    expect(report.assumptions.tokensPerToolDefinition).toBe(175);
    expect(report.decisions[0]?.costSavedIfEnforced).toMatchObject({
      estimateKind: "estimated",
      tokensPerToolDefinition: 175,
    });
  });

  it("scales the estimated saving with --tokens-per-tool", async () => {
    const grossSaving = async (tokensPerToolText: string): Promise<number> => {
      const report = await reportFor({
        projectName: "fixture-project",
        sinceText: "7d",
        tokensPerToolText,
      });
      const saving = report.decisions[0]?.costSavedIfEnforced;
      if (saving?.estimateKind !== "estimated" || saving.grossSavingInUsd === null) {
        throw new Error("expected an estimated saving");
      }
      return saving.grossSavingInUsd;
    };
    // The fixtures never hit the input-token cap, so the saving is linear in tokens per tool.
    expect(await grossSaving("300")).toBeCloseTo((await grossSaving("150")) * 2, 9);
  });

  it("shows the assumption in the text footer", async () => {
    const capturedRun = await runCaptured({
      projectName: "fixture-project",
      sinceText: "7d",
      tokensPerToolText: "80",
      json: false,
    });
    expect(capturedRun.output).toContain(
      "* Estimated savings assume 80 tokens per tool definition (--tokens-per-tool)",
    );
  });

  it("rejects a bad --tokens-per-tool with exit code 1", async () => {
    const capturedRun = await runCaptured({
      projectName: null,
      sinceText: "7d",
      tokensPerToolText: "lots",
      json: false,
    });
    expect(capturedRun.exitCode).toBe(1);
    expect(capturedRun.errorOutput).toContain('--tokens-per-tool "lots"');
  });

  it("rejects a bad --since with exit code 1", async () => {
    const capturedRun = await runCaptured({ projectName: null, sinceText: "soon", json: false });
    expect(capturedRun.exitCode).toBe(1);
    expect(capturedRun.output).toBe("");
    expect(capturedRun.errorOutput).toContain('--since "soon"');
  });

  it("exits 1 with a message when the trace folder cannot be read", async () => {
    const capturedRun = await runCaptured(
      { projectName: "fixture-project", sinceText: "7d", json: false },
      {
        dependencies: {
          listDirectory: async () => {
            throw Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
          },
        },
      },
    );
    expect(capturedRun.exitCode).toBe(1);
    expect(capturedRun.errorOutput).toMatch(/^krino report: could not read traces: /);
  });
});

describe("banner and colors", () => {
  const reportOptions = { projectName: "fixture-project", sinceText: "7d", json: false };

  it("shows a colored banner at a terminal", async () => {
    const capturedRun = await runCaptured(reportOptions, { isTerminal: true });
    expect(capturedRun.output.startsWith(`${ANSI_ESCAPE}1m`)).toBe(true);
    expect(capturedRun.output).toContain("krino");
  });

  it("shows the banner without colors when NO_COLOR is set", async () => {
    const capturedRun = await runCaptured(reportOptions, {
      isTerminal: true,
      dependencies: { environment: { NO_COLOR: "1" } },
    });
    expect(capturedRun.output.startsWith("krino · ")).toBe(true);
    expect(capturedRun.output).not.toContain(ANSI_ESCAPE);
  });

  it("prints no banner and no colors when stdout is not a terminal", async () => {
    const capturedRun = await runCaptured(reportOptions, { isTerminal: false });
    expect(capturedRun.output.startsWith("krino report\n")).toBe(true);
    expect(capturedRun.output).not.toContain(ANSI_ESCAPE);
  });

  it("never prints the banner with --json", async () => {
    const capturedRun = await runCaptured({ ...reportOptions, json: true }, { isTerminal: true });
    expect(() => JSON.parse(capturedRun.output)).not.toThrow();
  });
});

describe("external strings are never used as plain-object keys", () => {
  it.each(["constructor", "toString", "__proto__"])(
    "reads a trace whose names and statuses are %s",
    async (externalName) => {
      const traceLine = JSON.stringify({
        traceSchemaVersion: 1,
        recordType: "agentStep",
        projectName: externalName,
        runIdentifier: externalName,
        stepNumber: 0,
        hostName: externalName,
        hostSdkVersion: "1.0.0",
        modelIdentifier: externalName,
        availableToolNames: [externalName, "search"],
        chosenToolNames: [externalName],
        tokenUsage: { inputTokens: 10, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
        costInUsd: null,
        latencyInMilliseconds: null,
        recordedAt: "2026-10-01T10:00:00.000Z",
        decisions: [
          {
            decisionKind: "toolSelection",
            decisionMode: externalName,
            decisionStatus: externalName,
            suggestedChoice: externalName,
            appliedChoice: null,
            probability: null,
            decisionModelVersion: null,
            latencyInMilliseconds: 5,
            decisionCostInUsd: 0.001,
          },
        ],
        contentHash: null,
      });
      const traceFolder = temporaryTraceFolder({ "traces-2026-10-01.jsonl": `${traceLine}\n` });
      const report = await reportFor(
        { projectName: externalName, sinceText: "7d" },
        { environment: { KRINO_TRACE_DIRECTORY: traceFolder } },
      );
      expect(report.records.projectNames).toEqual([externalName]);
      expect(report.decisions).toHaveLength(1);
      expect(report.decisions[0]).toMatchObject({
        decisionMode: externalName,
        callCount: 1,
        statusCounts: {
          answered: 0,
          timedOut: 0,
          failed: 0,
          cutOff: 0,
          skippedUnsupported: 0,
          skippedExploration: 0,
        },
      });
      expect(report.cacheHealth.byHost.map((hostShares) => hostShares.hostName)).toEqual([
        externalName,
      ]);
      expect(Object.getPrototypeOf(report.decisions[0]?.statusCounts)).toBe(Object.prototype);
    },
  );
});
