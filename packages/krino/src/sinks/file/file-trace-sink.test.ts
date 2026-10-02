import { existsSync } from "node:fs";
import { readdir, rm, stat, writeFile } from "node:fs/promises";
import nodePath from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentStepTrace, HostCapabilities } from "../../contracts/index.js";
import { DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS } from "../../contracts/index.js";
import { createKrinoRuntime } from "../../core/index.js";
import {
  answerEveryQuestion,
  createLocalTestProvider,
  runSummaryInput,
  stepTraceInput,
} from "../../core/local-test-doubles.js";
import {
  createFileTraceSink,
  type FileTraceSinkDependencies,
  nodeTraceFileSystem,
  type TraceFileSystem,
} from "./file-trace-sink.js";
import {
  agentStepRecord,
  createTemporaryDirectory,
  parseJsonLines,
  readEveryFile,
  removeTemporaryDirectory,
  runSummaryRecord,
} from "./test-support.js";

const OCTOBER_SECOND = new Date("2026-10-02T09:00:00.000Z");

let temporaryDirectory = "";
let standardErrorMessages: Array<string> = [];

beforeEach(async () => {
  temporaryDirectory = await createTemporaryDirectory();
  standardErrorMessages = [];
});

afterEach(async () => {
  vi.useRealTimers();
  await removeTemporaryDirectory(temporaryDirectory);
});

function testDependencies(
  dependencyOverrides: Partial<FileTraceSinkDependencies> = {},
): Partial<FileTraceSinkDependencies> {
  return {
    currentTime: () => OCTOBER_SECOND,
    environment: {},
    homeDirectory: () => nodePath.join(temporaryDirectory, "home"),
    workingDirectory: () => temporaryDirectory,
    writeToStandardError: (message) => {
      standardErrorMessages.push(message);
    },
    ...dependencyOverrides,
  };
}

function steps(stepCount: number, recordFields: Partial<AgentStepTrace> = {}) {
  return Array.from({ length: stepCount }, (_, stepNumber) =>
    agentStepRecord({ stepNumber, ...recordFields }),
  );
}

async function linesOnDisk(directoryPath: string): Promise<Array<Record<string, unknown>>> {
  return (await readEveryFile(directoryPath)).flatMap(parseJsonLines);
}

describe("buffered async writes", () => {
  it("writeRecord returns before anything is on disk; flush puts it on disk", async () => {
    const traceSink = createFileTraceSink(
      { projectName: "demo", traceDirectory: temporaryDirectory },
      testDependencies(),
    );
    traceSink.writeRecord(agentStepRecord());
    expect(existsSync(nodePath.join(temporaryDirectory, "traces-2026-10-02.jsonl"))).toBe(false);

    await traceSink.flush(DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS);

    const traceFiles = await readEveryFile(temporaryDirectory);
    expect(traceFiles.map((traceFile) => traceFile.fileName)).toEqual(["traces-2026-10-02.jsonl"]);
    expect(traceFiles.flatMap(parseJsonLines)).toEqual([agentStepRecord()]);
  });

  it("keeps the write order and writes one JSON object per line", async () => {
    const traceSink = createFileTraceSink(
      { projectName: "demo", traceDirectory: temporaryDirectory },
      testDependencies(),
    );
    const records = [...steps(5), runSummaryRecord({ stepCount: 5 })];
    for (const traceRecord of records) {
      traceSink.writeRecord(traceRecord);
    }
    await traceSink.flush(DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS);
    traceSink.writeRecord(agentStepRecord({ stepNumber: 99 }));
    await traceSink.flush(DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS);

    expect(await linesOnDisk(temporaryDirectory)).toEqual([
      ...records,
      agentStepRecord({ stepNumber: 99 }),
    ]);
  });

  it("appends to an existing file instead of replacing it", async () => {
    const tracePath = nodePath.join(temporaryDirectory, "traces-2026-10-02.jsonl");
    await writeFile(tracePath, `${JSON.stringify(agentStepRecord({ stepNumber: 7 }))}\n`);
    const traceSink = createFileTraceSink(
      { projectName: "demo", traceDirectory: temporaryDirectory },
      testDependencies(),
    );
    traceSink.writeRecord(agentStepRecord({ stepNumber: 8 }));
    await traceSink.flush(DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS);

    const stepNumbers = (await linesOnDisk(temporaryDirectory)).map((line) => line.stepNumber);
    expect(stepNumbers).toEqual([7, 8]);
  });

  it("flush with nothing buffered resolves at once", async () => {
    const traceSink = createFileTraceSink(
      { projectName: "demo", traceDirectory: temporaryDirectory },
      testDependencies(),
    );
    await expect(traceSink.flush(0)).resolves.toBeUndefined();
    expect(await readdir(temporaryDirectory)).toEqual([]);
  });

  it("flush resolves when the timeout passes even if the disk never answers", async () => {
    const hangingFileSystem: TraceFileSystem = {
      ...nodeTraceFileSystem,
      appendText: () => new Promise<void>(() => {}),
    };
    const traceSink = createFileTraceSink(
      { projectName: "demo", traceDirectory: temporaryDirectory },
      testDependencies({ fileSystem: hangingFileSystem }),
    );
    traceSink.writeRecord(agentStepRecord());

    const startedAt = performance.now();
    await traceSink.flush(50);
    const waited = performance.now() - startedAt;

    expect(waited).toBeGreaterThanOrEqual(40);
    expect(waited).toBeLessThan(DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS);
  });

  it.each([Number.NaN, -1, Number.POSITIVE_INFINITY])(
    "flush(%s) waits the default flush timeout from contracts/defaults.ts",
    async (unusableTimeout) => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const hangingFileSystem: TraceFileSystem = {
        ...nodeTraceFileSystem,
        appendText: () => new Promise<void>(() => {}),
      };
      const traceSink = createFileTraceSink(
        { projectName: "demo", traceDirectory: temporaryDirectory },
        testDependencies({ fileSystem: hangingFileSystem }),
      );
      traceSink.writeRecord(agentStepRecord());
      let flushed = false;
      void traceSink.flush(unusableTimeout).then(() => {
        flushed = true;
      });

      await vi.advanceTimersByTimeAsync(DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS - 1);
      expect(flushed).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(flushed).toBe(true);
    },
  );
});

describe("default directory", () => {
  it("writes to KRINO_TRACE_DIRECTORY", async () => {
    const environmentDirectory = nodePath.join(temporaryDirectory, "from-environment");
    const traceSink = createFileTraceSink(
      { projectName: "demo" },
      testDependencies({
        environment: {
          KRINO_TRACE_DIRECTORY: environmentDirectory,
          XDG_STATE_HOME: nodePath.join(temporaryDirectory, "state"),
        },
      }),
    );
    traceSink.writeRecord(agentStepRecord());
    await traceSink.flush(DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS);

    expect(traceSink.traceDirectory).toBe(environmentDirectory);
    expect(await readdir(environmentDirectory)).toEqual(["traces-2026-10-02.jsonl"]);
  });

  it("writes to XDG_STATE_HOME/krino/traces/<project> when KRINO_TRACE_DIRECTORY is not set", async () => {
    const stateHome = nodePath.join(temporaryDirectory, "state");
    const traceSink = createFileTraceSink(
      { projectName: "demo" },
      testDependencies({ environment: { XDG_STATE_HOME: stateHome } }),
    );
    traceSink.writeRecord(agentStepRecord());
    await traceSink.flush(DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS);

    const expectedDirectory = nodePath.join(stateHome, "krino", "traces", "demo");
    expect(traceSink.traceDirectory).toBe(expectedDirectory);
    expect(await readdir(expectedDirectory)).toEqual(["traces-2026-10-02.jsonl"]);
  });

  it("falls back to <home>/.krino/traces/<project>", async () => {
    const traceSink = createFileTraceSink({ projectName: "demo" }, testDependencies());
    traceSink.writeRecord(agentStepRecord());
    await traceSink.flush(DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS);

    const expectedDirectory = nodePath.join(temporaryDirectory, "home", ".krino", "traces", "demo");
    expect(traceSink.traceDirectory).toBe(expectedDirectory);
    expect(await readdir(expectedDirectory)).toEqual(["traces-2026-10-02.jsonl"]);
  });

  it.runIf(process.platform === "win32")(
    "writes to a real Windows drive path with a project name Windows forbids",
    async () => {
      const traceSink = createFileTraceSink(
        { projectName: "team/billing:agent?" },
        testDependencies(),
      );
      traceSink.writeRecord(agentStepRecord());
      await traceSink.flush(DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS);

      expect(traceSink.traceDirectory).toMatch(/^[A-Za-z]:\\/);
      expect(traceSink.traceDirectory).toBe(
        nodePath.win32.join(temporaryDirectory, "home", ".krino", "traces", "team-billing-agent-"),
      );
      expect(await linesOnDisk(temporaryDirectory)).toHaveLength(1);
    },
  );
});

describe("daily files and rotation", () => {
  it("writes one file per UTC day", async () => {
    let currentTime = new Date("2026-10-02T23:59:59.999Z");
    const traceSink = createFileTraceSink(
      { projectName: "demo", traceDirectory: temporaryDirectory },
      testDependencies({ currentTime: () => currentTime }),
    );
    traceSink.writeRecord(agentStepRecord({ stepNumber: 0 }));
    currentTime = new Date("2026-10-03T00:00:00.000Z");
    traceSink.writeRecord(agentStepRecord({ stepNumber: 1 }));
    traceSink.writeRecord(agentStepRecord({ stepNumber: 2 }));
    await traceSink.flush(DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS);

    const traceFiles = await readEveryFile(temporaryDirectory);
    expect(
      traceFiles.map((traceFile) => [
        traceFile.fileName,
        parseJsonLines(traceFile).map((line) => line.stepNumber),
      ]),
    ).toEqual([
      ["traces-2026-10-02.jsonl", [0]],
      ["traces-2026-10-03.jsonl", [1, 2]],
    ]);
  });

  it("rotates before a line would pass the size limit and never splits a line", async () => {
    const lineSize = Buffer.byteLength(`${JSON.stringify(agentStepRecord())}\n`);
    const rotationSizeInBytes = lineSize * 3;
    const traceSink = createFileTraceSink(
      { projectName: "demo", traceDirectory: temporaryDirectory },
      testDependencies({ rotationSizeInBytes }),
    );
    for (const traceRecord of steps(8)) {
      traceSink.writeRecord(traceRecord);
    }
    await traceSink.flush(DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS);

    const traceFiles = await readEveryFile(temporaryDirectory);
    expect(traceFiles.map((traceFile) => traceFile.fileName)).toEqual([
      "traces-2026-10-02.1.jsonl",
      "traces-2026-10-02.2.jsonl",
      "traces-2026-10-02.jsonl",
    ]);
    for (const traceFile of traceFiles) {
      expect(Buffer.byteLength(traceFile.text)).toBeLessThanOrEqual(rotationSizeInBytes);
    }
    const stepNumbersByFile = Object.fromEntries(
      traceFiles.map((traceFile) => [
        traceFile.fileName,
        parseJsonLines(traceFile).map((line) => line.stepNumber),
      ]),
    );
    expect(stepNumbersByFile).toEqual({
      "traces-2026-10-02.jsonl": [0, 1, 2],
      "traces-2026-10-02.1.jsonl": [3, 4, 5],
      "traces-2026-10-02.2.jsonl": [6, 7],
    });
  });

  it("puts a line larger than the limit in a file of its own", async () => {
    const traceSink = createFileTraceSink(
      { projectName: "demo", traceDirectory: temporaryDirectory },
      testDependencies({ rotationSizeInBytes: 10 }),
    );
    for (const traceRecord of steps(2)) {
      traceSink.writeRecord(traceRecord);
    }
    await traceSink.flush(DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS);

    const traceFiles = await readEveryFile(temporaryDirectory);
    expect(traceFiles.map((traceFile) => parseJsonLines(traceFile).length)).toEqual([1, 1]);
  });

  it("continues the latest rotated file already on disk, as a new process would", async () => {
    await writeFile(nodePath.join(temporaryDirectory, "traces-2026-10-02.jsonl"), "");
    await writeFile(nodePath.join(temporaryDirectory, "traces-2026-10-02.4.jsonl"), "");
    const traceSink = createFileTraceSink(
      { projectName: "demo", traceDirectory: temporaryDirectory },
      testDependencies(),
    );
    traceSink.writeRecord(agentStepRecord());
    await traceSink.flush(DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS);

    const latestFile = await stat(nodePath.join(temporaryDirectory, "traces-2026-10-02.4.jsonl"));
    expect(latestFile.size).toBeGreaterThan(0);
  });
});

describe("concurrency", () => {
  const CONCURRENT_RUN_COUNT = 20;
  const STEPS_PER_RUN = 15;
  const capabilities: HostCapabilities = {
    supportedDecisions: ["toolSelection", "riskGate"],
    toolSelectionTiming: "perStep",
    reportsPerStepUsage: true,
  };

  it("20 concurrent runs produce valid JSONL with every line present", async () => {
    // A small rotation size makes the runs race across file boundaries too.
    const traceSink = createFileTraceSink(
      { projectName: "demo", traceDirectory: temporaryDirectory },
      testDependencies({ rotationSizeInBytes: 16 * 1024 }),
    );
    let runCounter = 0;
    const krinoRuntime = createKrinoRuntime(
      {
        projectName: "demo",
        decisionModes: { toolSelection: "shadow" },
        decisionProvider: createLocalTestProvider(answerEveryQuestion("yes", 0.95), 1),
        traceSink,
      },
      {
        createRunIdentifier: () => `run-${runCounter++}`,
        warn: () => {},
      },
    );

    await Promise.all(
      Array.from({ length: CONCURRENT_RUN_COUNT }, async () => {
        const runHandle = krinoRuntime.startRun({
          hostName: "ai-sdk",
          hostSdkVersion: "7.0.0-test",
          capabilities,
        });
        for (let stepNumber = 0; stepNumber < STEPS_PER_RUN; stepNumber += 1) {
          const outcome = await runHandle.decideToolSelection({
            runIdentifier: runHandle.runIdentifier,
            stepNumber,
            taskText: "concurrency test",
            availableTools: [{ toolName: "search", toolDescription: "Search." }],
            recentMessagesText: "",
          });
          runHandle.recordStep(
            stepTraceInput({
              runIdentifier: runHandle.runIdentifier,
              stepNumber,
              decisions: [outcome.decisionRecord],
            }),
          );
          await new Promise((resolveTick) => setImmediate(resolveTick));
        }
        await runHandle.finishRun(
          runSummaryInput({ runIdentifier: runHandle.runIdentifier, stepCount: STEPS_PER_RUN }),
        );
      }),
    );
    await krinoRuntime.flushAll(DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS);

    const traceFiles = await readEveryFile(temporaryDirectory);
    expect(traceFiles.length).toBeGreaterThan(1);
    const lines = traceFiles.flatMap(parseJsonLines);
    expect(lines).toHaveLength(CONCURRENT_RUN_COUNT * (STEPS_PER_RUN + 1));
    for (let runNumber = 0; runNumber < CONCURRENT_RUN_COUNT; runNumber += 1) {
      const runLines = lines.filter((line) => line.runIdentifier === `run-${runNumber}`);
      expect(runLines.filter((line) => line.recordType === "agentStep")).toHaveLength(
        STEPS_PER_RUN,
      );
      expect(runLines.filter((line) => line.recordType === "runSummary")).toHaveLength(1);
    }
    expect(standardErrorMessages).toEqual([]);
  });

  it("20 sinks writing to the same directory at once produce valid JSONL", async () => {
    const traceSinks = Array.from({ length: CONCURRENT_RUN_COUNT }, () =>
      createFileTraceSink(
        { projectName: "demo", traceDirectory: temporaryDirectory },
        testDependencies(),
      ),
    );
    await Promise.all(
      traceSinks.map(async (traceSink, sinkNumber) => {
        for (let stepNumber = 0; stepNumber < STEPS_PER_RUN; stepNumber += 1) {
          traceSink.writeRecord(
            agentStepRecord({ runIdentifier: `sink-${sinkNumber}`, stepNumber }),
          );
          await new Promise((resolveTick) => setImmediate(resolveTick));
        }
        await traceSink.flush(DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS);
      }),
    );

    const lines = await linesOnDisk(temporaryDirectory);
    expect(lines).toHaveLength(CONCURRENT_RUN_COUNT * STEPS_PER_RUN);
    expect(standardErrorMessages).toEqual([]);
  });
});

describe("failures never reach the host", () => {
  it("logs a write failure once to stderr, keeps running, and recovers", async () => {
    // A file where the directory should be makes every write fail.
    const blockedDirectory = nodePath.join(temporaryDirectory, "blocked");
    await writeFile(blockedDirectory, "not a directory");
    const traceSink = createFileTraceSink(
      { projectName: "demo", traceDirectory: blockedDirectory },
      testDependencies(),
    );

    for (let batchNumber = 0; batchNumber < 3; batchNumber += 1) {
      expect(() =>
        traceSink.writeRecord(agentStepRecord({ stepNumber: batchNumber })),
      ).not.toThrow();
      await expect(traceSink.flush(DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS)).resolves.toBeUndefined();
    }
    expect(standardErrorMessages).toHaveLength(1);
    expect(standardErrorMessages[0]).toContain("krino: trace sink could not write to");
    expect(standardErrorMessages[0]).toContain(blockedDirectory);

    await rm(blockedDirectory);
    traceSink.writeRecord(agentStepRecord({ stepNumber: 3 }));
    await traceSink.flush(DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS);

    expect((await linesOnDisk(blockedDirectory)).map((line) => line.stepNumber)).toEqual([3]);
    expect(standardErrorMessages).toHaveLength(1);
  });

  it("logs to the real stderr by default", async () => {
    const blockedDirectory = nodePath.join(temporaryDirectory, "blocked");
    await writeFile(blockedDirectory, "not a directory");
    const standardErrorWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const { writeToStandardError: _ignored, ...dependencies } = testDependencies();
      const traceSink = createFileTraceSink(
        { projectName: "demo", traceDirectory: blockedDirectory },
        dependencies,
      );
      traceSink.writeRecord(agentStepRecord());
      await traceSink.flush(DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS);
      traceSink.writeRecord(agentStepRecord());
      await traceSink.flush(DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS);

      expect(standardErrorWrite).toHaveBeenCalledTimes(1);
      expect(String(standardErrorWrite.mock.calls[0]?.[0])).toMatch(/^krino: .*\n$/);
    } finally {
      standardErrorWrite.mockRestore();
    }
  });

  it("drops a record that cannot be serialized, logs once, and still writes the rest", async () => {
    const traceSink = createFileTraceSink(
      { projectName: "demo", traceDirectory: temporaryDirectory },
      testDependencies(),
    );
    const unserializable = agentStepRecord({
      tokenUsage: {
        inputTokens: 1n as unknown as number,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
    });
    expect(() => traceSink.writeRecord(unserializable)).not.toThrow();
    expect(() => traceSink.writeRecord(unserializable)).not.toThrow();
    traceSink.writeRecord(agentStepRecord({ stepNumber: 1 }));
    await traceSink.flush(DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS);

    expect((await linesOnDisk(temporaryDirectory)).map((line) => line.stepNumber)).toEqual([1]);
    expect(standardErrorMessages).toHaveLength(1);
    expect(standardErrorMessages[0]).toContain("could not serialize");
  });

  it("does not throw when the trace directory cannot be resolved", async () => {
    const traceSink = createFileTraceSink(
      { projectName: "demo" },
      testDependencies({
        homeDirectory: () => {
          throw new Error("no home directory");
        },
      }),
    );
    expect(traceSink.traceDirectory).toBeNull();
    traceSink.writeRecord(agentStepRecord());
    await traceSink.flush(DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS);
    traceSink.writeRecord(agentStepRecord());
    await traceSink.flush(DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS);

    expect(standardErrorMessages).toHaveLength(1);
    expect(standardErrorMessages[0]).toContain("no home directory");
  });

  it("survives a stderr writer that throws", async () => {
    const blockedDirectory = nodePath.join(temporaryDirectory, "blocked");
    await writeFile(blockedDirectory, "not a directory");
    const traceSink = createFileTraceSink(
      { projectName: "demo", traceDirectory: blockedDirectory },
      testDependencies({
        writeToStandardError: () => {
          throw new Error("stderr is closed");
        },
      }),
    );
    traceSink.writeRecord(agentStepRecord());
    await expect(traceSink.flush(DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS)).resolves.toBeUndefined();
  });
});
