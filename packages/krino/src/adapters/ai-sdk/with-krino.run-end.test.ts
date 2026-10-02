import { generateText, stepCountIs, streamText, type Telemetry, type ToolSet, tool } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { withKrino } from "./index.js";
import {
  createLocalToolSet,
  createScriptedModel,
  createTestKrino,
  type ScriptedStep,
} from "./test-support.js";
import { resetWarningsForTesting } from "./warn-once.js";

const PROMPT = "Cancel order A-1.";

const TWO_STEP_SCRIPT: Array<ScriptedStep> = [
  { toolCalls: [{ toolName: "getOrder" }] },
  { text: "Done." },
];

/** A model whose first call returns a tool call and whose second call fails. */
function createFailingModel(modelError: Error): MockLanguageModelV4 {
  const scriptedModel = createScriptedModel(TWO_STEP_SCRIPT);
  let callCount = 0;
  return new MockLanguageModelV4({
    provider: "anthropic.messages",
    modelId: "claude-haiku-4-5",
    doGenerate: async (callOptions) => {
      callCount += 1;
      if (callCount > 1) {
        throw modelError;
      }
      return scriptedModel.doGenerate(callOptions);
    },
    doStream: async (callOptions) => {
      callCount += 1;
      if (callCount > 1) {
        throw modelError;
      }
      return scriptedModel.doStream(callOptions);
    },
  });
}

/** A tool set whose `getOrder` aborts the run while it executes. */
function createAbortingToolSet(abortController: AbortController): ToolSet {
  return {
    ...createLocalToolSet(),
    getOrder: tool({
      description: "Gets an order.",
      inputSchema: z.object({ reference: z.string() }),
      execute: async () => {
        abortController.abort(new Error("caller cancelled"));
        return { status: "open" };
      },
    }),
  };
}

const TELEMETRY_HOOK_NAMES = [
  "onStart",
  "onStepStart",
  "onLanguageModelCallStart",
  "onLanguageModelCallEnd",
  "onToolExecutionStart",
  "onToolExecutionEnd",
  "onStepEnd",
  "onEnd",
  "onAbort",
  "onError",
] as const;

type ObservedTelemetryEvent = {
  hookName: string;
  recordInputs: unknown;
  recordOutputs: unknown;
  functionId: unknown;
};

/** A global integration that records every hook it receives and the recording flags it sees. */
function createObservingIntegration(observedEvents: Array<ObservedTelemetryEvent>): Telemetry {
  const observingIntegration: Telemetry = {};
  for (const hookName of TELEMETRY_HOOK_NAMES) {
    Object.assign(observingIntegration, {
      [hookName]: (telemetryEvent: unknown) => {
        const eventRecord =
          typeof telemetryEvent === "object" && telemetryEvent !== null
            ? (telemetryEvent as Record<string, unknown>)
            : {};
        observedEvents.push({
          hookName,
          recordInputs: eventRecord.recordInputs,
          recordOutputs: eventRecord.recordOutputs,
          functionId: eventRecord.functionId,
        });
      },
    });
  }
  return observingIntegration;
}

describe("withKrino run end", () => {
  const originalGlobalIntegrations = globalThis.AI_SDK_TELEMETRY_INTEGRATIONS;

  beforeEach(() => {
    resetWarningsForTesting();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    globalThis.AI_SDK_TELEMETRY_INTEGRATIONS = originalGlobalIntegrations;
    vi.restoreAllMocks();
  });

  it("success: finishRun writes one run summary", async () => {
    const testKrino = createTestKrino();

    await generateText(
      withKrino(
        {
          model: createScriptedModel(TWO_STEP_SCRIPT),
          tools: createLocalToolSet(),
          prompt: PROMPT,
          stopWhen: stepCountIs(5),
        },
        testKrino.krinoRuntime,
      ),
    );

    const runSummaries = await testKrino.waitForRunSummaries(1);
    expect(runSummaries).toHaveLength(1);
    expect(runSummaries[0]).toMatchObject({ stepCount: 2, usedToolNames: ["getOrder"] });
  });

  it("thrown error (generateText): the error reaches the caller and a run summary is written", async () => {
    const testKrino = createTestKrino();
    const modelError = new Error("model overloaded");

    await expect(
      generateText(
        withKrino(
          {
            model: createFailingModel(modelError),
            tools: createLocalToolSet(),
            prompt: PROMPT,
            stopWhen: stepCountIs(5),
            maxRetries: 0,
          },
          testKrino.krinoRuntime,
        ),
      ),
    ).rejects.toThrow("model overloaded");

    const runSummaries = await testKrino.waitForRunSummaries(1);
    expect(runSummaries).toHaveLength(1);
    expect(runSummaries[0]).toMatchObject({ stepCount: 1, usedToolNames: ["getOrder"] });
  });

  it("thrown error (streamText): a run summary is written", async () => {
    const testKrino = createTestKrino();

    const streamResult = streamText(
      withKrino(
        {
          model: createFailingModel(new Error("stream broke")),
          tools: createLocalToolSet(),
          prompt: PROMPT,
          stopWhen: stepCountIs(5),
          maxRetries: 0,
          onError: () => {},
        },
        testKrino.krinoRuntime,
      ),
    );
    await streamResult.consumeStream({ onError: () => {} });

    const runSummaries = await testKrino.waitForRunSummaries(1);
    expect(runSummaries).toHaveLength(1);
  });

  it("thrown error on the first streamText model call: telemetry onError writes the summary", async () => {
    // ai 7.0.126: a failure on the first streamText call reaches only telemetry onError (no
    // onEnd); a failure on a later step ends with onEnd. Both write one run summary.
    const testKrino = createTestKrino();
    const failingModel = new MockLanguageModelV4({
      doStream: async () => {
        throw new Error("first call failed");
      },
    });

    await streamText(
      withKrino(
        {
          model: failingModel,
          tools: createLocalToolSet(),
          prompt: PROMPT,
          maxRetries: 0,
          onError: () => {},
        },
        testKrino.krinoRuntime,
      ),
    ).consumeStream({ onError: () => {} });

    const runSummaries = await testKrino.waitForRunSummaries(1);
    expect(runSummaries).toHaveLength(1);
    expect(runSummaries[0]?.stepCount).toBe(0);
  });

  it("caller prepareStep throws: a run summary is written", async () => {
    const testKrino = createTestKrino();

    await expect(
      generateText(
        withKrino(
          {
            model: createScriptedModel(TWO_STEP_SCRIPT),
            tools: createLocalToolSet(),
            prompt: PROMPT,
            prepareStep: () => {
              throw new Error("caller prepareStep failed");
            },
          },
          testKrino.krinoRuntime,
        ),
      ),
    ).rejects.toThrow("caller prepareStep failed");

    expect(await testKrino.waitForRunSummaries(1)).toHaveLength(1);
  });

  it("abort (generateText): a run summary is written exactly once", async () => {
    const testKrino = createTestKrino();
    const abortController = new AbortController();

    await expect(
      generateText(
        withKrino(
          {
            model: createScriptedModel(TWO_STEP_SCRIPT),
            tools: createAbortingToolSet(abortController),
            prompt: PROMPT,
            stopWhen: stepCountIs(5),
            abortSignal: abortController.signal,
          },
          testKrino.krinoRuntime,
        ),
      ),
    ).rejects.toThrow();

    const runSummaries = await testKrino.waitForRunSummaries(1);
    // Give any late duplicate a chance to appear.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(testKrino.runSummaries()).toHaveLength(1);
    expect(runSummaries[0]?.runIdentifier).toBe("test-run-1");
  });

  it("abort (streamText): a run summary is written", async () => {
    const testKrino = createTestKrino();
    const abortController = new AbortController();
    const callerOnAbort = vi.fn();

    const streamResult = streamText(
      withKrino(
        {
          model: createScriptedModel(TWO_STEP_SCRIPT),
          tools: createAbortingToolSet(abortController),
          prompt: PROMPT,
          stopWhen: stepCountIs(5),
          abortSignal: abortController.signal,
          onAbort: callerOnAbort,
        },
        testKrino.krinoRuntime,
      ),
    );
    await streamResult.consumeStream({ onError: () => {} });

    expect(await testKrino.waitForRunSummaries(1)).toHaveLength(1);
    expect(callerOnAbort).toHaveBeenCalledTimes(1);
  });

  it("calls the caller's onEnd, onStepEnd and onStart", async () => {
    const testKrino = createTestKrino();
    const callerOnStart = vi.fn();
    const callerOnStepEnd = vi.fn();
    const callerOnEnd = vi.fn();

    await generateText(
      withKrino(
        {
          model: createScriptedModel(TWO_STEP_SCRIPT),
          tools: createLocalToolSet(),
          prompt: PROMPT,
          stopWhen: stepCountIs(5),
          onStart: callerOnStart,
          onStepEnd: callerOnStepEnd,
          onEnd: callerOnEnd,
        },
        testKrino.krinoRuntime,
      ),
    );

    expect(callerOnStart).toHaveBeenCalledTimes(1);
    expect(callerOnStepEnd).toHaveBeenCalledTimes(2);
    expect(callerOnEnd).toHaveBeenCalledTimes(1);
  });

  it("calls the caller's deprecated onStepFinish and onFinish aliases", async () => {
    const testKrino = createTestKrino();
    const callerOnStepFinish = vi.fn();
    const callerOnFinish = vi.fn();

    await generateText(
      withKrino(
        {
          model: createScriptedModel(TWO_STEP_SCRIPT),
          tools: createLocalToolSet(),
          prompt: PROMPT,
          stopWhen: stepCountIs(5),
          onStepFinish: callerOnStepFinish,
          onFinish: callerOnFinish,
        },
        testKrino.krinoRuntime,
      ),
    );

    expect(callerOnStepFinish).toHaveBeenCalledTimes(2);
    expect(callerOnFinish).toHaveBeenCalledTimes(1);
    expect(await testKrino.waitForRunSummaries(1)).toHaveLength(1);
  });

  it("telemetry isEnabled false is respected: a thrown error writes no run summary", async () => {
    const testKrino = createTestKrino();
    const callerOptions = {
      model: createFailingModel(new Error("model overloaded")),
      tools: createLocalToolSet(),
      prompt: PROMPT,
      stopWhen: stepCountIs(5),
      maxRetries: 0,
      telemetry: { isEnabled: false },
    };

    const krinoOptions = withKrino(callerOptions, testKrino.krinoRuntime);
    await expect(generateText(krinoOptions)).rejects.toThrow("model overloaded");

    expect(krinoOptions.telemetry).toBe(callerOptions.telemetry);
    await new Promise((resolve) => setTimeout(resolve, 50));
    // Documented limit: without telemetry, generateText reports errors to no callback.
    expect(testKrino.runSummaries()).toHaveLength(0);
  });

  it("telemetry isEnabled false: an abort still writes a run summary", async () => {
    const testKrino = createTestKrino();
    const abortController = new AbortController();

    await expect(
      generateText(
        withKrino(
          {
            model: createScriptedModel(TWO_STEP_SCRIPT),
            tools: createAbortingToolSet(abortController),
            prompt: PROMPT,
            stopWhen: stepCountIs(5),
            abortSignal: abortController.signal,
            telemetry: { isEnabled: false },
          },
          testKrino.krinoRuntime,
        ),
      ),
    ).rejects.toThrow();

    expect(await testKrino.waitForRunSummaries(1)).toHaveLength(1);
  });

  it("never changes the global telemetry integrations, even after 10 runs", async () => {
    const testKrino = createTestKrino();
    const globalIntegration = createObservingIntegration([]);
    const globalIntegrations = [globalIntegration];
    globalThis.AI_SDK_TELEMETRY_INTEGRATIONS = globalIntegrations;

    for (let runIndex = 0; runIndex < 10; runIndex += 1) {
      await generateText(
        withKrino(
          {
            model: createScriptedModel(TWO_STEP_SCRIPT),
            tools: createLocalToolSet(),
            prompt: PROMPT,
            stopWhen: stepCountIs(5),
          },
          testKrino.krinoRuntime,
        ),
      );
    }

    expect(globalThis.AI_SDK_TELEMETRY_INTEGRATIONS).toBe(globalIntegrations);
    expect(globalIntegrations).toHaveLength(1);
    expect(globalIntegrations[0]).toBe(globalIntegration);
    expect(await testKrino.waitForRunSummaries(10)).toHaveLength(10);
  });

  it("with no caller telemetry config, krino adds no events and turns on no recording", async () => {
    const runAndObserve = async (useKrino: boolean): Promise<Array<ObservedTelemetryEvent>> => {
      const observedEvents: Array<ObservedTelemetryEvent> = [];
      globalThis.AI_SDK_TELEMETRY_INTEGRATIONS = [createObservingIntegration(observedEvents)];
      const callerOptions = {
        model: createScriptedModel(TWO_STEP_SCRIPT),
        tools: createLocalToolSet(),
        prompt: PROMPT,
        stopWhen: stepCountIs(5),
      };
      await generateText(
        useKrino ? withKrino(callerOptions, createTestKrino().krinoRuntime) : callerOptions,
      );
      return observedEvents;
    };

    const eventsWithoutKrino = await runAndObserve(false);
    const eventsWithKrino = await runAndObserve(true);

    expect(eventsWithoutKrino.length).toBeGreaterThan(0);
    expect(eventsWithKrino).toEqual(eventsWithoutKrino);
    for (const observedEvent of eventsWithKrino) {
      expect(observedEvent.recordInputs).toBeUndefined();
      expect(observedEvent.recordOutputs).toBeUndefined();
      expect(observedEvent.functionId).toBeUndefined();
    }
  });

  it("adds only an integration to the caller's telemetry and keeps the caller's integrations", async () => {
    const testKrino = createTestKrino();
    const globalEvents: Array<ObservedTelemetryEvent> = [];
    const callerEvents: Array<ObservedTelemetryEvent> = [];
    globalThis.AI_SDK_TELEMETRY_INTEGRATIONS = [createObservingIntegration(globalEvents)];
    const callerIntegration = createObservingIntegration(callerEvents);
    const callerTelemetry = { functionId: "order-desk", integrations: callerIntegration };

    const krinoOptions = withKrino(
      {
        model: createScriptedModel(TWO_STEP_SCRIPT),
        tools: createLocalToolSet(),
        prompt: PROMPT,
        stopWhen: stepCountIs(5),
        telemetry: callerTelemetry,
      },
      testKrino.krinoRuntime,
    );
    await generateText(krinoOptions);

    expect(Object.keys(krinoOptions.telemetry ?? {}).sort()).toEqual([
      "functionId",
      "integrations",
    ]);
    expect(krinoOptions.telemetry?.integrations).toHaveLength(2);
    expect(callerEvents.length).toBeGreaterThan(0);
    // Per-call integrations replace the global ones in the AI SDK; krino keeps that rule.
    expect(globalEvents).toHaveLength(0);
    expect(callerTelemetry.integrations).toBe(callerIntegration);
  });
});
