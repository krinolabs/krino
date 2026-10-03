import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import nodePath from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CACHE_READ_SHARE_MINIMUM,
  CUT_OFF_SHARE_MAXIMUM,
  checkCacheHealth,
  checkConfigFile,
  checkCutOffRate,
  checkFakeProvider,
  checkGatewayKey,
  checkNodeVersion,
  checkRecentTraces,
  checkTraceFolderWritable,
  probeFileSystemFromDisk,
} from "./doctor-checks.js";
import { summarizeTraceLines, type TraceScanSummary } from "./doctor-trace-scan.js";

function emptySummary(): TraceScanSummary {
  return summarizeTraceLines([], { projectName: null, sinceEpochMilliseconds: 0 });
}

function summaryWith(overrides: Partial<TraceScanSummary>): TraceScanSummary {
  return { ...emptySummary(), ...overrides };
}

describe("checkNodeVersion", () => {
  it.each([
    ["22.0.0", "pass"],
    ["24.6.0", "pass"],
    ["21.7.3", "fail"],
    ["18.20.0", "fail"],
    ["garbage", "fail"],
  ])("Node %s → %s", (nodeVersion, expectedStatus) => {
    expect(checkNodeVersion(nodeVersion).checkStatus).toBe(expectedStatus);
  });

  it("gives a fix line on fail", () => {
    expect(checkNodeVersion("20.1.0").fixLine).toContain("Node.js 22");
  });
});

describe("checkConfigFile", () => {
  it("passes on a valid config", () => {
    const configCheck = checkConfigFile({
      configKind: "valid",
      configPath: "C:\\Projects\\shop\\krino.config.json",
      projectName: "shop",
      traceDirectory: null,
    });
    expect(configCheck.checkStatus).toBe("pass");
    expect(configCheck.detail).toContain("C:\\Projects\\shop\\krino.config.json");
  });

  it("warns without a config and points at krino init", () => {
    const configCheck = checkConfigFile({ configKind: "missing" });
    expect(configCheck.checkStatus).toBe("warn");
    expect(configCheck.fixLine).toContain("krino init");
  });

  it("fails on an unreadable config", () => {
    const configCheck = checkConfigFile({
      configKind: "invalid",
      configPath: "/p/krino.config.json",
      message: "krino.config.json is not valid JSON",
    });
    expect(configCheck.checkStatus).toBe("fail");
    expect(configCheck.detail).toContain("not valid JSON");
    expect(configCheck.fixLine).toContain("krino init --force");
  });
});

describe("checkGatewayKey", () => {
  const secretValue = "sk-test-SENTINEL-1234567890";

  it("passes when set, and prints only 'present'", () => {
    const keyCheck = checkGatewayKey({ AI_GATEWAY_API_KEY: secretValue });
    expect(keyCheck.checkStatus).toBe("pass");
    expect(keyCheck.detail).toBe("present");
    expect(JSON.stringify(keyCheck)).not.toContain("SENTINEL");
  });

  it.each([
    ["unset", {}],
    ["empty", { AI_GATEWAY_API_KEY: "" }],
    ["blank", { AI_GATEWAY_API_KEY: "   " }],
  ])(
    "warns (does not fail) when %s, because the fake provider works without it",
    (_caseName, environment) => {
      const keyCheck = checkGatewayKey(environment);
      expect(keyCheck.checkStatus).toBe("warn");
      expect(keyCheck.detail).toBe("missing");
      expect(keyCheck.fixLine).toContain("AI_GATEWAY_API_KEY");
    },
  );
});

describe("checkFakeProvider", () => {
  it("warns when recent decisions came from the fake provider", () => {
    const providerCheck = checkFakeProvider(
      summaryWith({ decisionCount: 10, fakeProviderDecisionCount: 4 }),
    );
    expect(providerCheck.checkStatus).toBe("warn");
    expect(providerCheck.detail).toContain("4 of 10");
    expect(providerCheck.fixLine).toContain("createJevAiGatewayProvider");
    expect(providerCheck.fixLine).toContain("@krinolabs/krino/providers/jev");
  });

  it("passes when no decision came from the fake provider", () => {
    expect(checkFakeProvider(summaryWith({ decisionCount: 10 })).checkStatus).toBe("pass");
  });

  it("passes with nothing to check", () => {
    const providerCheck = checkFakeProvider(emptySummary());
    expect(providerCheck.checkStatus).toBe("pass");
    expect(providerCheck.detail).toContain("no recent decisions");
  });
});

describe("checkRecentTraces", () => {
  it("warns when there are no recent trace files", () => {
    const tracesCheck = checkRecentTraces({
      readKind: "read",
      traceDirectory: "C:\\traces\\shop",
      traceFileCount: 0,
      traceSummary: emptySummary(),
    });
    expect(tracesCheck.checkStatus).toBe("warn");
    expect(tracesCheck.detail).toContain("C:\\traces\\shop");
    expect(tracesCheck.fixLine).toContain("krino init");
  });

  it("passes when every line parses", () => {
    const tracesCheck = checkRecentTraces({
      readKind: "read",
      traceDirectory: "/t",
      traceFileCount: 2,
      traceSummary: summarizeTraceLines([], { projectName: null, sinceEpochMilliseconds: 0 }),
    });
    // No lines at all counts as no traces.
    expect(tracesCheck.checkStatus).toBe("warn");
    const parsedCheck = checkRecentTraces({
      readKind: "read",
      traceDirectory: "/t",
      traceFileCount: 2,
      traceSummary: summaryWith({
        lineCounts: { ...emptySummary().lineCounts, readLineCount: 5, validLineCount: 5 },
        runCount: 2,
        agentStepCount: 3,
      }),
    });
    expect(parsedCheck.checkStatus).toBe("pass");
    expect(parsedCheck.detail).toContain("2 runs");
  });

  it("warns with counts when some lines do not parse", () => {
    const tracesCheck = checkRecentTraces({
      readKind: "read",
      traceDirectory: "/t",
      traceFileCount: 1,
      traceSummary: summaryWith({
        lineCounts: {
          readLineCount: 10,
          validLineCount: 7,
          invalidJsonLineCount: 1,
          unsupportedSchemaVersionLineCount: 1,
          invalidShapeLineCount: 1,
        },
      }),
    });
    expect(tracesCheck.checkStatus).toBe("warn");
    expect(tracesCheck.detail).toContain("3 of 10 lines skipped");
  });

  it("fails when no line parses", () => {
    const tracesCheck = checkRecentTraces({
      readKind: "read",
      traceDirectory: "/t",
      traceFileCount: 1,
      traceSummary: summaryWith({
        lineCounts: { ...emptySummary().lineCounts, readLineCount: 2, invalidJsonLineCount: 2 },
      }),
    });
    expect(tracesCheck.checkStatus).toBe("fail");
  });

  it("fails when the files cannot be read", () => {
    const tracesCheck = checkRecentTraces({
      readKind: "readError",
      traceDirectory: "/t",
      message: "EACCES: permission denied",
    });
    expect(tracesCheck.checkStatus).toBe("fail");
    expect(tracesCheck.detail).toContain("EACCES");
  });
});

describe("checkCutOffRate", () => {
  it(`warns above ${CUT_OFF_SHARE_MAXIMUM * 100}% of decisions`, () => {
    const cutOffCheck = checkCutOffRate(
      summaryWith({ decisionCount: 100, cutOffDecisionCount: 6 }),
    );
    expect(cutOffCheck.checkStatus).toBe("warn");
    expect(cutOffCheck.detail).toContain("6 of 100");
    expect(cutOffCheck.fixLine).toContain("flushAll");
  });

  it("passes at exactly 5% and below", () => {
    expect(
      checkCutOffRate(summaryWith({ decisionCount: 100, cutOffDecisionCount: 5 })).checkStatus,
    ).toBe("pass");
    expect(checkCutOffRate(summaryWith({ decisionCount: 100 })).checkStatus).toBe("pass");
  });

  it("passes with nothing to check", () => {
    expect(checkCutOffRate(emptySummary()).checkStatus).toBe("pass");
  });
});

describe("checkCacheHealth", () => {
  function usage(uncachedTokens: number, cacheReadTokens: number, cacheWriteTokens: number) {
    return summaryWith({
      multiStepRunUsage: { runCount: 3, uncachedTokens, cacheReadTokens, cacheWriteTokens },
    });
  }

  it(`warns when the cache read share is below ${CACHE_READ_SHARE_MINIMUM * 100}%`, () => {
    const cacheCheck = checkCacheHealth(usage(600, 300, 100));
    expect(cacheCheck.checkStatus).toBe("warn");
    expect(cacheCheck.detail).toContain("30%");
    expect(cacheCheck.detail).toContain("3 multi-step runs");
  });

  it("passes at 50% and above", () => {
    expect(checkCacheHealth(usage(400, 500, 100)).checkStatus).toBe("pass");
    expect(checkCacheHealth(usage(100, 800, 100)).checkStatus).toBe("pass");
  });

  it("passes with no multi-step runs", () => {
    const cacheCheck = checkCacheHealth(emptySummary());
    expect(cacheCheck.checkStatus).toBe("pass");
    expect(cacheCheck.detail).toContain("no multi-step runs");
  });
});

describe("checkTraceFolderWritable", () => {
  let rootFolder = "";

  beforeEach(async () => {
    // A space in the folder name, like many Windows user folders.
    rootFolder = nodePath.join(
      await mkdtemp(nodePath.join(tmpdir(), "krino-doctor-write-")),
      "my traces",
    );
    await mkdir(rootFolder);
  });

  afterEach(async () => {
    await rm(nodePath.dirname(rootFolder), { recursive: true, force: true, maxRetries: 5 });
  });

  it("passes for an existing writable folder and leaves no probe file", async () => {
    const writeCheck = await checkTraceFolderWritable(rootFolder, probeFileSystemFromDisk);
    expect(writeCheck.checkStatus).toBe("pass");
    expect(writeCheck.detail).toContain(rootFolder);
    expect(await readdir(rootFolder)).toEqual([]);
  });

  it("passes for a missing folder whose nearest existing parent is writable, and creates nothing", async () => {
    const missingFolder = nodePath.join(rootFolder, "shop", "2026");
    const writeCheck = await checkTraceFolderWritable(missingFolder, probeFileSystemFromDisk);
    expect(writeCheck.checkStatus).toBe("pass");
    expect(writeCheck.detail).toContain("does not exist yet");
    expect(await readdir(rootFolder)).toEqual([]);
  });

  it("fails when a file is in the way", async () => {
    await writeFile(nodePath.join(rootFolder, "shop"), "not a folder");
    const writeCheck = await checkTraceFolderWritable(
      nodePath.join(rootFolder, "shop", "traces"),
      probeFileSystemFromDisk,
    );
    expect(writeCheck.checkStatus).toBe("fail");
    expect(writeCheck.detail).toContain("is a file");
    expect(writeCheck.fixLine).toContain("--trace-dir");
  });

  it("fails when the probe write is refused", async () => {
    const writeCheck = await checkTraceFolderWritable(rootFolder, {
      ...probeFileSystemFromDisk,
      writeProbe: async () => {
        throw Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
      },
    });
    expect(writeCheck.checkStatus).toBe("fail");
    expect(writeCheck.detail).toContain("EACCES");
  });
});
