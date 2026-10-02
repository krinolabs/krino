import { describe, expect, it } from "vitest";
import type { KrinoConfig } from "./config.js";
import type { HostCapabilities, StepContext } from "./host.js";
import type { RunStartOptions, RunSummaryInput, StepTraceInput } from "./runtime.js";
import { createStubDecisionRecord, createStubKrino, encodeToolNameChoice } from "./stub-runtime.js";
import { TRACE_SCHEMA_VERSION } from "./trace.js";

const fixedTime = new Date("2026-10-02T12:00:00.000Z");

const testConfig: KrinoConfig = {
  projectName: "stub-test-project",
  // The stub always returns shadow outcomes, even when enforce is configured.
  decisionModes: { toolSelection: "enforce", riskGate: "shadow" },
};

const aiSdkCapabilities: HostCapabilities = {
  supportedDecisions: ["toolSelection", "riskGate"],
  toolSelectionTiming: "perStep",
  reportsPerStepUsage: true,
};

const runStart: RunStartOptions = {
  hostName: "ai-sdk",
  hostSdkVersion: "7.0.0",
  capabilities: aiSdkCapabilities,
};

function createTestRuntime() {
  return createStubKrino(testConfig, { currentTime: () => fixedTime });
}

function createStepContext(runIdentifier: string): StepContext {
  return {
    runIdentifier,
    stepNumber: 0,
    taskText: "[redacted]",
    availableTools: [
      { toolName: "search", toolDescription: "Search the web" },
      { toolName: "readFile", toolDescription: "Read a file" },
      { toolName: "deleteFile", toolDescription: "Delete a file" },
    ],
    recentMessagesText: "",
  };
}

function createStepTraceInput(runIdentifier: string, stepNumber: number): StepTraceInput {
  return {
    runIdentifier,
    stepNumber,
    hostName: "ai-sdk",
    hostSdkVersion: "7.0.0",
    modelIdentifier: "claude-sonnet-5-5",
    availableToolNames: ["search", "readFile"],
    chosenToolNames: ["search"],
    tokenUsage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 50, cacheWriteTokens: 10 },
    costInUsd: 0.001,
    latencyInMilliseconds: 420,
    decisions: [],
    contentHash: null,
  };
}

function createRunSummaryInput(runIdentifier: string): RunSummaryInput {
  return {
    runIdentifier,
    hostName: "ai-sdk",
    hostSdkVersion: "7.0.0",
    modelIdentifier: "claude-sonnet-5-5",
    totalTokenUsage: {
      inputTokens: 100,
      outputTokens: 20,
      cacheReadTokens: 50,
      cacheWriteTokens: 10,
    },
    totalCostInUsd: 0.001,
    stepCount: 1,
    usedToolNames: ["search"],
    toolSelectionAgreement: null,
  };
}

describe("createStubKrino", () => {
  it("gives each run a unique identifier and remembers how it started", () => {
    const stubRuntime = createTestRuntime();
    const firstRun = stubRuntime.startRun(runStart);
    const secondRun = stubRuntime.startRun({ ...runStart, hostName: "claude-agent-sdk" });

    expect(firstRun.runIdentifier).not.toBe(secondRun.runIdentifier);
    expect(stubRuntime.startedRuns).toEqual([
      { ...runStart, runIdentifier: firstRun.runIdentifier },
      { ...runStart, hostName: "claude-agent-sdk", runIdentifier: secondRun.runIdentifier },
    ]);
  });

  describe("decideToolSelection", () => {
    it("sends all tools (shadow) and records the request", async () => {
      const stubRuntime = createTestRuntime();
      const runHandle = stubRuntime.startRun(runStart);
      const stepContext = createStepContext(runHandle.runIdentifier);

      const outcome = await runHandle.decideToolSelection(stepContext);

      expect(outcome.toolNamesToSend).toEqual(["search", "readFile", "deleteFile"]);
      expect(stubRuntime.toolSelectionRequests).toEqual([stepContext]);
    });

    it("records a shadow decision with no suggestion and all tools applied", async () => {
      const runHandle = createTestRuntime().startRun(runStart);

      const outcome = await runHandle.decideToolSelection(
        createStepContext(runHandle.runIdentifier),
      );

      expect(outcome.decisionRecord).toEqual({
        decisionKind: "toolSelection",
        decisionMode: "shadow",
        decisionStatus: "skippedUnsupported",
        suggestedChoice: null,
        appliedChoice: "deleteFile,readFile,search",
        probability: null,
        decisionModelVersion: "stub",
        latencyInMilliseconds: null,
        decisionCostInUsd: null,
      });
    });

    it("sends an empty list when the step has no tools", async () => {
      const runHandle = createTestRuntime().startRun(runStart);

      const outcome = await runHandle.decideToolSelection({
        ...createStepContext(runHandle.runIdentifier),
        availableTools: [],
      });

      expect(outcome.toolNamesToSend).toEqual([]);
      expect(outcome.decisionRecord.appliedChoice).toBe("");
    });
  });

  describe("checkToolCallRisk", () => {
    it("applies no verdict (shadow) and suggests askHuman (fail closed)", async () => {
      const stubRuntime = createTestRuntime();
      const runHandle = stubRuntime.startRun(runStart);
      const pendingToolCall = {
        runIdentifier: runHandle.runIdentifier,
        stepNumber: 2,
        toolName: "deleteFile",
        toolArguments: { path: "/tmp/example" },
      };

      const outcome = await runHandle.checkToolCallRisk(pendingToolCall);

      expect(outcome.verdictToApply).toBeNull();
      expect(outcome.suggestedVerdict).toBe("askHuman");
      expect(outcome.suggestedVerdict).not.toBe("allow");
      expect(outcome.decisionRecord).toEqual(createStubDecisionRecord("riskGate", null));
      expect(outcome.decisionRecord.decisionStatus).toBe("skippedUnsupported");
      expect(outcome.decisionRecord.decisionModelVersion).toBe("stub");
      expect(outcome.decisionRecord.decisionMode).toBe("shadow");
      expect(stubRuntime.riskGateRequests).toEqual([pendingToolCall]);
    });
  });

  describe("recordStep", () => {
    it("writes a step trace with the runtime-filled fields", () => {
      const stubRuntime = createTestRuntime();
      const runHandle = stubRuntime.startRun(runStart);
      const stepTraceInput = createStepTraceInput(runHandle.runIdentifier, 0);

      runHandle.recordStep(stepTraceInput);

      expect(stubRuntime.writtenTraces).toEqual([
        {
          ...stepTraceInput,
          traceSchemaVersion: TRACE_SCHEMA_VERSION,
          recordType: "agentStep",
          projectName: "stub-test-project",
          recordedAt: "2026-10-02T12:00:00.000Z",
        },
      ]);
    });

    it("uses the system clock when no clock is given", () => {
      const stubRuntime = createStubKrino(testConfig);
      const runHandle = stubRuntime.startRun(runStart);
      const timeBefore = Date.now();

      runHandle.recordStep(createStepTraceInput(runHandle.runIdentifier, 0));

      const recordedAt = stubRuntime.writtenTraces[0]?.recordedAt ?? "";
      expect(Date.parse(recordedAt)).toBeGreaterThanOrEqual(timeBefore);
      expect(Date.parse(recordedAt)).toBeLessThanOrEqual(Date.now());
    });

    it("ignores steps after the run finished instead of throwing", async () => {
      const stubRuntime = createTestRuntime();
      const runHandle = stubRuntime.startRun(runStart);
      await runHandle.finishRun(createRunSummaryInput(runHandle.runIdentifier));

      expect(() =>
        runHandle.recordStep(createStepTraceInput(runHandle.runIdentifier, 1)),
      ).not.toThrow();
      expect(stubRuntime.writtenTraces).toHaveLength(1);
    });
  });

  describe("finishRun", () => {
    it("writes a run summary with the runtime-filled fields", async () => {
      const stubRuntime = createTestRuntime();
      const runHandle = stubRuntime.startRun(runStart);
      const runSummaryInput = createRunSummaryInput(runHandle.runIdentifier);

      await runHandle.finishRun(runSummaryInput);

      expect(stubRuntime.writtenTraces).toEqual([
        {
          ...runSummaryInput,
          traceSchemaVersion: TRACE_SCHEMA_VERSION,
          recordType: "runSummary",
          projectName: "stub-test-project",
          recordedAt: "2026-10-02T12:00:00.000Z",
        },
      ]);
    });

    it("writes one summary even when called twice (for example on error, then on finish)", async () => {
      const stubRuntime = createTestRuntime();
      const runHandle = stubRuntime.startRun(runStart);

      await runHandle.finishRun(createRunSummaryInput(runHandle.runIdentifier));
      await runHandle.finishRun(createRunSummaryInput(runHandle.runIdentifier));

      expect(stubRuntime.writtenTraces).toHaveLength(1);
    });

    it("keeps runs independent: finishing one run does not stop another", async () => {
      const stubRuntime = createTestRuntime();
      const firstRun = stubRuntime.startRun(runStart);
      const secondRun = stubRuntime.startRun(runStart);

      await firstRun.finishRun(createRunSummaryInput(firstRun.runIdentifier));
      secondRun.recordStep(createStepTraceInput(secondRun.runIdentifier, 0));

      expect(stubRuntime.writtenTraces.map((traceRecord) => traceRecord.recordType)).toEqual([
        "runSummary",
        "agentStep",
      ]);
      expect(stubRuntime.writtenTraces[1]?.runIdentifier).toBe(secondRun.runIdentifier);
    });

    it("keeps step order: steps first, then the summary", async () => {
      const stubRuntime = createTestRuntime();
      const runHandle = stubRuntime.startRun(runStart);

      runHandle.recordStep(createStepTraceInput(runHandle.runIdentifier, 0));
      runHandle.recordStep(createStepTraceInput(runHandle.runIdentifier, 1));
      await runHandle.finishRun(createRunSummaryInput(runHandle.runIdentifier));

      expect(
        stubRuntime.writtenTraces.map((traceRecord) =>
          traceRecord.recordType === "agentStep" ? `step ${traceRecord.stepNumber}` : "summary",
        ),
      ).toEqual(["step 0", "step 1", "summary"]);
    });
  });

  describe("flushAll", () => {
    it("resolves at once and records the timeout it was given", async () => {
      const stubRuntime = createTestRuntime();

      await expect(stubRuntime.flushAll(2000)).resolves.toBeUndefined();
      expect(stubRuntime.flushTimeouts).toEqual([2000]);
    });
  });
});

describe("encodeToolNameChoice", () => {
  it("sorts tool names and joins them with commas", () => {
    expect(encodeToolNameChoice(["search", "deleteFile", "readFile"])).toBe(
      "deleteFile,readFile,search",
    );
  });

  it("does not change the input array", () => {
    const toolNames = ["search", "deleteFile"];
    encodeToolNameChoice(toolNames);
    expect(toolNames).toEqual(["search", "deleteFile"]);
  });
});
