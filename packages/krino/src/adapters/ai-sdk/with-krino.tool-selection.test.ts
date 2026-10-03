import { generateText, stepCountIs, streamText } from "ai";
import { describe, expect, it } from "vitest";
import type { KrinoRuntime, RunHandle, StepContext } from "../../contracts/index.js";
import usageFixture from "./fixtures/anthropic-usage-with-cache.json" with { type: "json" };
import { AI_SDK_HOST_CAPABILITIES, withKrino } from "./index.js";
import {
  createLocalToolSet,
  createScriptedModel,
  createTestKrino,
  LOCAL_TOOL_NAMES,
  type ScriptedStep,
  selectToolsAnswer,
  sentToolNamesByCall,
} from "./test-support.js";

type ToolSelectionSpy = { krinoRuntime: KrinoRuntime; toolSelectionContexts: Array<StepContext> };

/** Wraps a runtime so the test sees every `decideToolSelection` call. */
function spyOnToolSelection(krinoRuntime: KrinoRuntime): ToolSelectionSpy {
  const toolSelectionContexts: Array<StepContext> = [];
  return {
    toolSelectionContexts,
    krinoRuntime: {
      flushAll: krinoRuntime.flushAll,
      startRun: (runStart): RunHandle => {
        const runHandle = krinoRuntime.startRun(runStart);
        return {
          ...runHandle,
          decideToolSelection: (stepContext) => {
            toolSelectionContexts.push(stepContext);
            return runHandle.decideToolSelection(stepContext);
          },
        };
      },
    },
  };
}

const THREE_STEP_SCRIPT: Array<ScriptedStep> = [
  { toolCalls: [{ toolName: "getOrder" }] },
  { toolCalls: [{ toolName: "cancelOrder" }] },
  { text: "Order A-1 is cancelled." },
];

const FIVE_STEP_SCRIPT: Array<ScriptedStep> = [
  { toolCalls: [{ toolName: "getOrder" }] },
  { toolCalls: [{ toolName: "getOrder", reference: "A-2" }] },
  { toolCalls: [{ toolName: "cancelOrder" }] },
  { toolCalls: [{ toolName: "cancelOrder", reference: "A-2" }] },
  { text: "Both orders are cancelled." },
];

const PROMPT = "Cancel orders A-1 and A-2.";

describe("withKrino tool selection", () => {
  it("shadow: every step sends all tools and the suggestion is recorded on step 0", async () => {
    const testKrino = createTestKrino();
    const spy = spyOnToolSelection(testKrino.krinoRuntime);
    const model = createScriptedModel(THREE_STEP_SCRIPT);

    const result = await generateText(
      withKrino(
        { model, tools: createLocalToolSet(), prompt: PROMPT, stopWhen: stepCountIs(5) },
        spy.krinoRuntime,
      ),
    );

    expect(result.steps).toHaveLength(3);
    for (const sentToolNames of sentToolNamesByCall(model.doGenerateCalls)) {
      expect(sentToolNames).toEqual([...LOCAL_TOOL_NAMES]);
    }
    expect(spy.toolSelectionContexts.map((stepContext) => stepContext.stepNumber)).toEqual([0]);
    expect(spy.toolSelectionContexts[0]?.taskText).toBe(PROMPT);
    expect(spy.toolSelectionContexts[0]?.availableTools.map((tool) => tool.toolName)).toEqual([
      ...LOCAL_TOOL_NAMES,
    ]);

    const [runSummary] = await testKrino.waitForRunSummaries(1);
    // The runtime holds step 0's trace until its background decision settles, so sort.
    const stepTraces = testKrino
      .stepTraces()
      .sort((leftTrace, rightTrace) => leftTrace.stepNumber - rightTrace.stepNumber);
    expect(stepTraces.map((stepTrace) => stepTrace.stepNumber)).toEqual([0, 1, 2]);
    expect(stepTraces.map((stepTrace) => stepTrace.chosenToolNames)).toEqual([
      ["getOrder"],
      ["cancelOrder"],
      [],
    ]);
    for (const stepTrace of stepTraces) {
      expect(stepTrace.hostName).toBe("ai-sdk");
      expect(stepTrace.availableToolNames).toEqual([...LOCAL_TOOL_NAMES]);
      expect(stepTrace.modelIdentifier).toBe("claude-haiku-4-5");
    }
    const stepZeroToolSelection = stepTraces[0]?.decisions.find(
      (decisionRecord) => decisionRecord.decisionKind === "toolSelection",
    );
    expect(stepZeroToolSelection?.decisionMode).toBe("shadow");
    expect(stepZeroToolSelection?.appliedChoice).toBe([...LOCAL_TOOL_NAMES].sort().join(","));
    expect(runSummary?.stepCount).toBe(3);
    expect(runSummary?.usedToolNames).toEqual(["getOrder", "cancelOrder"]);
    expect(runSummary?.hostName).toBe("ai-sdk");
    expect(runSummary?.modelIdentifier).toBe("claude-haiku-4-5");
  });

  it("enforce: step 0 sends only the selected tools", async () => {
    const testKrino = createTestKrino({
      decisionModes: { toolSelection: "enforce", riskGate: "shadow" },
      answerQuestion: selectToolsAnswer(["getOrder", "cancelOrder"]),
    });
    const spy = spyOnToolSelection(testKrino.krinoRuntime);
    const model = createScriptedModel(THREE_STEP_SCRIPT);

    await generateText(
      withKrino(
        { model, tools: createLocalToolSet(), prompt: PROMPT, stopWhen: stepCountIs(5) },
        spy.krinoRuntime,
      ),
    );

    expect(sentToolNamesByCall(model.doGenerateCalls)[0]).toEqual(["getOrder", "cancelOrder"]);
    expect(spy.toolSelectionContexts.map((stepContext) => stepContext.stepNumber)).toEqual([0]);
    await testKrino.waitForRunSummaries(1);
    const stepZeroToolSelection = testKrino
      .stepTraces()[0]
      ?.decisions.find((decisionRecord) => decisionRecord.decisionKind === "toolSelection");
    expect(stepZeroToolSelection).toMatchObject({
      decisionMode: "enforce",
      decisionStatus: "answered",
      appliedChoice: "cancelOrder,getOrder",
      suggestedChoice: "cancelOrder,getOrder",
    });
    expect(testKrino.stepTraces()[0]?.availableToolNames).toEqual(["getOrder", "cancelOrder"]);
    expect(testKrino.runSummaries()[0]?.toolSelectionAgreement).toBe(true);
  });

  it("cache trap guard: a 5-step enforce run sends the identical tool list on steps 1-4", async () => {
    const testKrino = createTestKrino({
      decisionModes: { toolSelection: "enforce", riskGate: "shadow" },
      answerQuestion: selectToolsAnswer(["getOrder", "cancelOrder"]),
    });
    const spy = spyOnToolSelection(testKrino.krinoRuntime);
    const model = createScriptedModel(FIVE_STEP_SCRIPT);

    const result = await generateText(
      withKrino(
        { model, tools: createLocalToolSet(), prompt: PROMPT, stopWhen: stepCountIs(5) },
        spy.krinoRuntime,
      ),
    );

    expect(result.steps).toHaveLength(5);
    const modelCalls = model.doGenerateCalls;
    expect(modelCalls).toHaveLength(5);
    const [stepZeroCall, ...laterCalls] = modelCalls;
    for (const laterCall of laterCalls) {
      // Full tool definitions, not just names: any byte change here breaks the prompt cache.
      expect(laterCall.tools).toEqual(laterCalls[0]?.tools);
      expect(laterCall.tools).toEqual(stepZeroCall?.tools);
    }
    expect(sentToolNamesByCall(laterCalls)).toEqual(
      Array.from({ length: 4 }, () => ["getOrder", "cancelOrder"]),
    );
    expect(spy.toolSelectionContexts).toHaveLength(1);
    expect(spy.toolSelectionContexts[0]?.stepNumber).toBe(0);
  });

  it("streamText: enforce sends the selected tools on every step", async () => {
    const testKrino = createTestKrino({
      decisionModes: { toolSelection: "enforce", riskGate: "shadow" },
      answerQuestion: selectToolsAnswer(["getOrder", "cancelOrder"]),
    });
    const model = createScriptedModel(THREE_STEP_SCRIPT);

    const streamResult = streamText(
      withKrino(
        { model, tools: createLocalToolSet(), prompt: PROMPT, stopWhen: stepCountIs(5) },
        testKrino.krinoRuntime,
      ),
    );
    await streamResult.consumeStream();

    expect(sentToolNamesByCall(model.doStreamCalls)).toEqual(
      Array.from({ length: 3 }, () => ["getOrder", "cancelOrder"]),
    );
    const [runSummary] = await testKrino.waitForRunSummaries(1);
    expect(runSummary?.stepCount).toBe(3);
  });

  it("selects only from the caller's activeTools", async () => {
    const testKrino = createTestKrino({
      decisionModes: { toolSelection: "enforce", riskGate: "shadow" },
      answerQuestion: selectToolsAnswer(["getOrder", "cancelOrder", "sendEmail"]),
    });
    const spy = spyOnToolSelection(testKrino.krinoRuntime);
    const model = createScriptedModel(THREE_STEP_SCRIPT);

    await generateText(
      withKrino(
        {
          model,
          tools: createLocalToolSet(),
          activeTools: ["getOrder", "cancelOrder", "createRefund"],
          prompt: PROMPT,
          stopWhen: stepCountIs(5),
        },
        spy.krinoRuntime,
      ),
    );

    expect(spy.toolSelectionContexts[0]?.availableTools.map((tool) => tool.toolName)).toEqual([
      "getOrder",
      "cancelOrder",
      "createRefund",
    ]);
    expect(sentToolNamesByCall(model.doGenerateCalls)).toEqual(
      Array.from({ length: 3 }, () => ["getOrder", "cancelOrder"]),
    );
  });

  it("no double billing: step traces exclude cache tokens from inputTokens", async () => {
    const testKrino = createTestKrino();
    const model = createScriptedModel([
      {
        toolCalls: [{ toolName: "getOrder" }],
        usage: usageFixture.usage,
        providerMetadata: usageFixture.providerMetadata,
      },
      { text: "Done.", usage: usageFixture.usage },
    ]);

    await generateText(
      withKrino(
        { model, tools: createLocalToolSet(), prompt: PROMPT, stopWhen: stepCountIs(5) },
        testKrino.krinoRuntime,
      ),
    );

    const [runSummary] = await testKrino.waitForRunSummaries(1);
    const stepUsages = testKrino.stepTraces().map((stepTrace) => stepTrace.tokenUsage);
    expect(stepUsages).toEqual([usageFixture.expectedTokenUsage, usageFixture.expectedTokenUsage]);
    expect(runSummary?.totalTokenUsage).toEqual({
      inputTokens: 100,
      outputTokens: 160,
      cacheReadTokens: 2400,
      cacheWriteTokens: 400,
    });
    // Priced from the step usage, cache tokens included (runtime price table for Haiku 4.5).
    expect(testKrino.stepTraces()[0]?.costInUsd).toBeGreaterThan(0);
    expect(runSummary?.totalCostInUsd).toBeCloseTo(
      testKrino
        .stepTraces()
        .reduce((costTotal, stepTrace) => costTotal + (stepTrace.costInUsd ?? 0), 0),
      12,
    );
  });

  it("declares its host capabilities when it starts a run", async () => {
    const testKrino = createTestKrino();
    const startedRuns: Array<Parameters<KrinoRuntime["startRun"]>[0]> = [];
    const recordingRuntime: KrinoRuntime = {
      flushAll: testKrino.krinoRuntime.flushAll,
      startRun: (runStart) => {
        startedRuns.push(runStart);
        return testKrino.krinoRuntime.startRun(runStart);
      },
    };

    await generateText(
      withKrino(
        {
          model: createScriptedModel([{ text: "Hi." }]),
          tools: createLocalToolSet(),
          prompt: "Hi",
        },
        recordingRuntime,
      ),
    );

    expect(AI_SDK_HOST_CAPABILITIES).toEqual({
      supportedDecisions: ["toolSelection", "riskGate"],
      toolSelectionTiming: "perStep",
      reportsPerStepUsage: true,
    });
    expect(startedRuns).toHaveLength(1);
    expect(startedRuns[0]?.hostName).toBe("ai-sdk");
    expect(startedRuns[0]?.capabilities).toEqual(AI_SDK_HOST_CAPABILITIES);
    expect(startedRuns[0]?.hostSdkVersion).toMatch(/^7\.\d+\.\d+/);
  });
});
