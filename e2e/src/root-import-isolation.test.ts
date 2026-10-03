import { mkdtemp } from "node:fs/promises";
import nodePath from "node:path";
import { describe, expect, inject, it } from "vitest";
import "./e2e-context.js";
import { runConsumerScript, runInstalledKrino } from "./consumer/consumer-commands.js";
import { readTraceRecords } from "./consumer/read-trace-records.js";
import { HOST_SDK_IMPORT_RULES } from "./imports/host-sdk-import-rules.js";
import { findForbiddenImports, findReachableBareImports } from "./imports/import-graph.js";
import { readPackedPackage } from "./tarball/packed-package.js";

// Acceptance: fails if any package imports a host SDK from the root entry point.
// Two checks: a static walk of each tarball's import graph, and a real run in a consumer project
// where `ai` and `@anthropic-ai/*` are not installed.

const e2eContext = inject("e2eContext");
const consumer = e2eContext.consumerWithoutHostSdks;

function tarballPathOf(packageName: string): string {
  const packedPackage = e2eContext.packedPackages.find(
    (candidate) => candidate.packageName === packageName,
  );
  if (packedPackage === undefined) {
    throw new Error(`The global setup did not pack ${packageName}.`);
  }
  return packedPackage.tarballPath;
}

describe.each(HOST_SDK_IMPORT_RULES)(
  "$packageName $entryPath imports no $forbiddenSpecifiers",
  (importRule) => {
    it("in its whole import graph, dynamic imports included", async () => {
      const packedContents = await readPackedPackage(tarballPathOf(importRule.packageName));
      const javaScriptFiles = new Map(
        [...packedContents.fileContents].flatMap(([packagePath, content]) =>
          packagePath.endsWith(".js") ? [[packagePath, content.toString("utf8")] as const] : [],
        ),
      );
      const bareImports = findReachableBareImports(importRule.entryPath, javaScriptFiles);
      expect(bareImports.length).toBeGreaterThan(0);
      expect(findForbiddenImports(bareImports, importRule.forbiddenSpecifiers)).toEqual([]);
    });
  },
);

describe("a consumer without ai or @anthropic-ai/* installed", () => {
  it("resolves the installed tarballs (the resolve check works)", async () => {
    const scriptResult = await runConsumerScript(consumer, "src/resolve-specifier.ts", [
      "@krinolabs/krino",
    ]);
    expect(scriptResult.stdout.trim()).toBe("resolved");
  });

  it.each(["ai", "ai/test", "@anthropic-ai/claude-agent-sdk"])(
    "cannot resolve %s",
    async (hostSpecifier) => {
      const scriptResult = await runConsumerScript(consumer, "src/resolve-specifier.ts", [
        hostSpecifier,
      ]);
      expect(scriptResult.stdout.trim()).toBe("unresolved");
    },
  );

  it("imports @krinolabs/krino and records a run with the fake provider", async () => {
    const traceDirectory = await mkdtemp(nodePath.join(consumer.directory, "traces-root-"));
    const scriptResult = await runConsumerScript(consumer, "src/root-only.ts", [], {
      KRINO_TRACE_DIRECTORY: traceDirectory,
    });
    expect(scriptResult.exitCode, scriptResult.stderr).toBe(0);
    // Shadow mode: all tools are sent and the risk gate applies nothing.
    expect(JSON.parse(scriptResult.stdout)).toEqual({
      toolNamesToSend: ["lookupOrder", "refundOrder"],
      riskVerdictToApply: null,
    });
    const traceRecords = await readTraceRecords(traceDirectory);
    expect(traceRecords.map((traceRecord) => traceRecord.recordType)).toEqual([
      "agentStep",
      "runSummary",
    ]);
    // The fake provider is not sure about the refund, and the risk gate fails closed.
    expect(traceRecords[0]?.decisions).toEqual([
      expect.objectContaining({ decisionKind: "toolSelection", decisionStatus: "answered" }),
      expect.objectContaining({
        decisionKind: "riskGate",
        decisionStatus: "answered",
        suggestedChoice: "askHuman",
      }),
    ]);
  });

  it("runs the installed krino CLI: --help and report", async () => {
    const helpResult = await runInstalledKrino(consumer, ["--help"]);
    expect(helpResult.exitCode, helpResult.stderr).toBe(0);
    expect(helpResult.stdout).toContain("report");
    const emptyTraceDirectory = await mkdtemp(nodePath.join(consumer.directory, "traces-empty-"));
    const reportResult = await runInstalledKrino(consumer, [
      "report",
      "--json",
      "--trace-dir",
      emptyTraceDirectory,
    ]);
    expect(reportResult.exitCode, reportResult.stderr).toBe(0);
    const report: { reportSchemaVersion: number } = JSON.parse(reportResult.stdout);
    expect(report.reportSchemaVersion).toBe(1);
  });
});
