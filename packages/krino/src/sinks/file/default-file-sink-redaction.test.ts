import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HostCapabilities, KrinoConfig } from "../../contracts/index.js";
import {
  DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS,
  TRACE_SCHEMA_VERSION,
} from "../../contracts/index.js";
import { answerEveryQuestion, createLocalTestProvider } from "../../core/local-test-doubles.js";
import { createKrino } from "../../index.js";
import { hashContent } from "../../redaction/index.js";
import { createFileTraceSink } from "./file-trace-sink.js";
import {
  createTemporaryDirectory,
  parseJsonLines,
  readEveryFile,
  removeTemporaryDirectory,
} from "./test-support.js";

const RAW_TASK_TEXT = "Refund order 88123 to Priya Raman at 14 Elm Street, card ending 4417";
const RAW_TASK_FRAGMENTS = ["88123", "Priya Raman", "14 Elm Street", "4417"];
const RAW_MESSAGES_TEXT = "user: my one-time code is 553901";

const capabilities: HostCapabilities = {
  supportedDecisions: ["toolSelection", "riskGate"],
  toolSelectionTiming: "perStep",
  reportsPerStepUsage: true,
};

let temporaryDirectory = "";

beforeEach(async () => {
  temporaryDirectory = await createTemporaryDirectory();
  vi.stubEnv("KRINO_TRACE_DIRECTORY", temporaryDirectory);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await removeTemporaryDirectory(temporaryDirectory);
});

/** Every written file whose text contains the needle. */
async function filesContaining(needle: string): Promise<Array<string>> {
  const writtenFiles = await readEveryFile(temporaryDirectory);
  return writtenFiles
    .filter((writtenFile) => writtenFile.text.includes(needle))
    .map((writtenFile) => writtenFile.fileName);
}

/** One full run through the public `createKrino`, the way an adapter drives it. */
async function runOneAgent(krinoConfig: Partial<KrinoConfig> = {}): Promise<void> {
  const krinoRuntime = createKrino({
    projectName: "redaction-test",
    decisionModes: { toolSelection: "shadow", riskGate: "shadow" },
    riskGatePolicy: {
      blockedToolNames: [],
      alwaysAllowedToolNames: [],
      allowThresholdByToolName: { refundOrder: 0.9 },
    },
    decisionProvider: createLocalTestProvider(answerEveryQuestion("yes", 0.95)),
    ...krinoConfig,
  });
  const runHandle = krinoRuntime.startRun({
    hostName: "ai-sdk",
    hostSdkVersion: "7.0.0-test",
    capabilities,
  });
  const outcome = await runHandle.decideToolSelection({
    runIdentifier: runHandle.runIdentifier,
    stepNumber: 0,
    taskText: RAW_TASK_TEXT,
    availableTools: [
      { toolName: "refundOrder", toolDescription: "Refund an order." },
      { toolName: "lookUpOrder", toolDescription: "Look up an order." },
    ],
    recentMessagesText: RAW_MESSAGES_TEXT,
  });
  const riskOutcome = await runHandle.checkToolCallRisk({
    runIdentifier: runHandle.runIdentifier,
    stepNumber: 0,
    toolName: "refundOrder",
    toolArguments: { orderNumber: "88123", note: RAW_TASK_TEXT },
  });
  runHandle.recordStep({
    runIdentifier: runHandle.runIdentifier,
    stepNumber: 0,
    hostName: "ai-sdk",
    hostSdkVersion: "7.0.0-test",
    modelIdentifier: "claude-sonnet-5-5",
    availableToolNames: ["lookUpOrder", "refundOrder"],
    chosenToolNames: ["refundOrder"],
    tokenUsage: { inputTokens: 900, outputTokens: 40, cacheReadTokens: 0, cacheWriteTokens: 0 },
    costInUsd: null,
    latencyInMilliseconds: 350,
    decisions: [outcome.decisionRecord, riskOutcome.decisionRecord],
    contentHash: hashContent(RAW_TASK_TEXT),
  });
  await runHandle.finishRun({
    runIdentifier: runHandle.runIdentifier,
    hostName: "ai-sdk",
    hostSdkVersion: "7.0.0-test",
    modelIdentifier: "claude-sonnet-5-5",
    totalTokenUsage: {
      inputTokens: 900,
      outputTokens: 40,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
    totalCostInUsd: 0,
    stepCount: 1,
    usedToolNames: ["refundOrder"],
    toolSelectionAgreement: true,
  });
  await krinoRuntime.flushAll(DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS);
}

describe("createKrino without a traceSink", () => {
  it("uses the file sink, writing to KRINO_TRACE_DIRECTORY", async () => {
    await runOneAgent();

    const writtenFiles = await readEveryFile(temporaryDirectory);
    expect(writtenFiles.map((writtenFile) => writtenFile.fileName)).toEqual([
      expect.stringMatching(/^traces-\d{4}-\d{2}-\d{2}\.jsonl$/),
    ]);
    const recordTypes = writtenFiles.flatMap(parseJsonLines).map((line) => line.recordType);
    expect(recordTypes).toEqual(["agentStep", "runSummary"]);
  });
});

describe("redaction is on by default", () => {
  it("no written file contains the raw task text or any part of it", async () => {
    await runOneAgent();

    const writtenFiles = await readEveryFile(temporaryDirectory);
    expect(writtenFiles.length).toBeGreaterThan(0);
    expect(await filesContaining(RAW_TASK_TEXT)).toEqual([]);
    for (const rawFragment of [...RAW_TASK_FRAGMENTS, RAW_MESSAGES_TEXT, "553901"]) {
      expect(await filesContaining(rawFragment)).toEqual([]);
    }
    // The task is still traceable by its hash.
    const stepLine = writtenFiles.flatMap(parseJsonLines)[0];
    expect(stepLine?.contentHash).toBe(hashContent(RAW_TASK_TEXT));
  });

  it("with redactContent: true set explicitly, no written file contains the raw task text", async () => {
    await runOneAgent({ redactContent: true });

    expect((await readEveryFile(temporaryDirectory)).length).toBeGreaterThan(0);
    expect(await filesContaining(RAW_TASK_TEXT)).toEqual([]);
  });

  it("the search would find the raw text if it were written (control)", async () => {
    const traceSink = createFileTraceSink({ projectName: "redaction-test" });
    traceSink.writeRecord({
      traceSchemaVersion: TRACE_SCHEMA_VERSION,
      recordType: "runSummary",
      projectName: "redaction-test",
      runIdentifier: "leaky-run",
      hostName: "ai-sdk",
      hostSdkVersion: "7.0.0-test",
      modelIdentifier: RAW_TASK_TEXT,
      totalTokenUsage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      totalCostInUsd: 0,
      stepCount: 0,
      usedToolNames: [],
      toolSelectionAgreement: null,
      routingCounterfactualCostInUsd: null,
      runOutcome: null,
      recordedAt: "2026-10-02T09:00:00.000Z",
    });
    await traceSink.flush(DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS);

    expect(await filesContaining(RAW_TASK_TEXT)).toHaveLength(1);
  });
});
