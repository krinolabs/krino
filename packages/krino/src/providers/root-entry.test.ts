import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

// The root entry `@krinolabs/krino` must work without the optional peer `ai`.

const SOURCE_ROOT = new URL("../", import.meta.url);
const RUNTIME_IMPORT_PATTERN =
  /^\s*(?:import|export)\s+(?!type\b)(?:[^"';]*?\sfrom\s+)?["']([^"']+)["']/gm;
const DYNAMIC_IMPORT_PATTERN = /\bimport\(\s*["']([^"']+)["']\s*\)/g;

/** Every module specifier a source file loads at runtime (type-only imports are erased). */
function runtimeSpecifiers(sourceText: string): Array<string> {
  return [
    ...[...sourceText.matchAll(RUNTIME_IMPORT_PATTERN)].map((match) => match[1] ?? ""),
    ...[...sourceText.matchAll(DYNAMIC_IMPORT_PATTERN)].map((match) => match[1] ?? ""),
  ];
}

/** Walks the runtime import graph from one source entry; returns bare package specifiers. */
function packagesImportedFrom(entryPath: string): Set<string> {
  const visitedFiles = new Set<string>();
  const bareSpecifiers = new Set<string>();
  const pendingFiles = [new URL(entryPath, SOURCE_ROOT)];
  while (pendingFiles.length > 0) {
    const fileUrl = pendingFiles.pop();
    if (fileUrl === undefined || visitedFiles.has(fileUrl.href)) {
      continue;
    }
    visitedFiles.add(fileUrl.href);
    for (const specifier of runtimeSpecifiers(readFileSync(fileUrl, "utf8"))) {
      if (specifier.startsWith(".")) {
        pendingFiles.push(new URL(specifier.replace(/\.js$/, ".ts"), fileUrl));
      } else {
        bareSpecifiers.add(specifier);
      }
    }
  }
  return bareSpecifiers;
}

function isAiSdkPackage(specifier: string): boolean {
  return specifier === "ai" || specifier.startsWith("ai/") || specifier.startsWith("@ai-sdk/");
}

afterEach(() => {
  vi.doUnmock("ai");
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("root entry point and the optional `ai` peer", () => {
  it("the root entry's runtime import graph never reaches `ai` or `@ai-sdk/*`", () => {
    const rootPackages = [...packagesImportedFrom("index.ts")];
    expect(rootPackages.filter(isAiSdkPackage)).toEqual([]);
  });

  it("control: the Jev entry's import graph does reach `ai`", () => {
    expect([...packagesImportedFrom("providers/jev-ai-gateway/index.ts")]).toContain("ai");
  });

  it("the root entry loads when importing `ai` would throw", async () => {
    vi.resetModules();
    vi.doMock("ai", () => {
      throw new Error("the root entry imported `ai`");
    });

    const rootEntry = await import("../index.js");

    expect(typeof rootEntry.createKrino).toBe("function");
    expect(typeof rootEntry.createFakeDecisionProvider).toBe("function");
  });

  it("control: the Jev entry fails to load when importing `ai` throws", async () => {
    vi.resetModules();
    vi.doMock("ai", () => {
      throw new Error("the Jev entry imported `ai`");
    });

    await expect(import("./jev-ai-gateway/index.js")).rejects.toThrow();
  });
});

describe("root createKrino default provider", () => {
  it("uses the fake provider, with a warning, when the config has none", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { createKrino } = await import("../index.js");

    createKrino({
      projectName: "default-provider-test",
      decisionModes: {},
      traceSink: { writeRecord: () => {}, flush: async () => {} },
    });

    expect(warnSpy).toHaveBeenCalledWith(
      'krino: no decisionProvider configured; using the "fake" provider',
    );
  });

  it("answers with the fake provider, so an unconfigured runtime still records decisions", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { createKrino } = await import("../index.js");
    const krinoRuntime = createKrino({
      projectName: "default-provider-test",
      decisionModes: { toolSelection: "enforce" },
      explorationRate: 0,
      traceSink: { writeRecord: () => {}, flush: async () => {} },
    });
    const runHandle = krinoRuntime.startRun({
      hostName: "ai-sdk",
      hostSdkVersion: "7.0.126",
      capabilities: {
        supportedDecisions: ["toolSelection"],
        toolSelectionTiming: "perStep",
        reportsPerStepUsage: true,
      },
    });

    const outcome = await runHandle.decideToolSelection({
      runIdentifier: runHandle.runIdentifier,
      stepNumber: 0,
      taskText: "Find the report.",
      availableTools: [
        { toolName: "search", toolDescription: "Search the web." },
        { toolName: "readFile", toolDescription: "Read a file." },
      ],
      recentMessagesText: "",
    });

    // Conservative fake answers: status answered, but no tool is removed.
    expect(outcome).toMatchObject({
      toolNamesToSend: ["search", "readFile"],
      decisionRecord: {
        decisionStatus: "answered",
        decisionModelVersion: "fake-decision-model-1",
      },
    });
  });
});
