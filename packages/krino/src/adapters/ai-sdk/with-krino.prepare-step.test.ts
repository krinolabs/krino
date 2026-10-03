import { generateText, stepCountIs } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACTIVE_TOOLS_CHANGED_WARNING } from "./call-runs.js";
import { withKrino } from "./index.js";
import {
  createLocalToolSet,
  createScriptedModel,
  createTestKrino,
  LOCAL_TOOL_NAMES,
  type ScriptedStep,
  selectToolsAnswer,
  sentToolNamesByCall,
} from "./test-support.js";
import { resetWarningsForTesting } from "./warn-once.js";

const THREE_STEP_SCRIPT: Array<ScriptedStep> = [
  { toolCalls: [{ toolName: "getOrder" }] },
  { toolCalls: [{ toolName: "cancelOrder" }] },
  { text: "Order A-1 is cancelled." },
];

const PROMPT = "Cancel order A-1.";

function enforceKrino() {
  return createTestKrino({
    decisionModes: { toolSelection: "enforce", riskGate: "shadow" },
    answerQuestion: selectToolsAnswer(["getOrder", "cancelOrder"]),
  });
}

describe("withKrino and the caller's prepareStep", () => {
  beforeEach(() => {
    resetWarningsForTesting();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs the caller's prepareStep on every step and keeps every field it returns", async () => {
    const testKrino = enforceKrino();
    const model = createScriptedModel(THREE_STEP_SCRIPT);
    const seenStepNumbers: Array<number> = [];

    await generateText(
      withKrino(
        {
          model,
          tools: createLocalToolSet(),
          prompt: PROMPT,
          stopWhen: stepCountIs(5),
          prepareStep: ({ stepNumber }) => {
            seenStepNumbers.push(stepNumber);
            return {
              instructions: `Step ${stepNumber}: be brief.`,
              providerOptions: { testProvider: { stepMarker: stepNumber } },
              toolChoice: "auto",
            };
          },
        },
        testKrino.krinoRuntime,
      ),
    );

    expect(seenStepNumbers).toEqual([0, 1, 2]);
    for (const [callIndex, modelCall] of model.doGenerateCalls.entries()) {
      expect(modelCall.providerOptions).toEqual({ testProvider: { stepMarker: callIndex } });
      expect(modelCall.prompt[0]).toEqual({
        role: "system",
        content: `Step ${callIndex}: be brief.`,
      });
      expect(modelCall.toolChoice).toEqual({ type: "auto" });
    }
    // krino's tool list is merged into the caller's result.
    expect(sentToolNamesByCall(model.doGenerateCalls)).toEqual(
      Array.from({ length: 3 }, () => ["getOrder", "cancelOrder"]),
    );
  });

  it("works when the caller's prepareStep returns undefined", async () => {
    const testKrino = enforceKrino();
    const model = createScriptedModel(THREE_STEP_SCRIPT);
    const callerPrepareStep = vi.fn(() => undefined);

    await generateText(
      withKrino(
        {
          model,
          tools: createLocalToolSet(),
          prompt: PROMPT,
          stopWhen: stepCountIs(5),
          prepareStep: callerPrepareStep,
        },
        testKrino.krinoRuntime,
      ),
    );

    expect(callerPrepareStep).toHaveBeenCalledTimes(3);
    expect(sentToolNamesByCall(model.doGenerateCalls)[2]).toEqual(["getOrder", "cancelOrder"]);
  });

  it("selects from the activeTools the caller's prepareStep returns on step 0", async () => {
    const testKrino = createTestKrino({
      decisionModes: { toolSelection: "enforce", riskGate: "shadow" },
      answerQuestion: selectToolsAnswer(["getOrder", "cancelOrder", "sendEmail"]),
    });
    const model = createScriptedModel(THREE_STEP_SCRIPT);

    await generateText(
      withKrino(
        {
          model,
          tools: createLocalToolSet(),
          prompt: PROMPT,
          stopWhen: stepCountIs(5),
          prepareStep: ({ stepNumber }) =>
            stepNumber === 0 ? { activeTools: ["getOrder", "cancelOrder", "lookupCustomer"] } : {},
        },
        testKrino.krinoRuntime,
      ),
    );

    expect(sentToolNamesByCall(model.doGenerateCalls)).toEqual(
      Array.from({ length: 3 }, () => ["getOrder", "cancelOrder"]),
    );
  });

  it("lets the caller change activeTools after step 0, records it and warns once per process", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const testKrino = enforceKrino();
    const runOnce = async () => {
      const model = createScriptedModel(THREE_STEP_SCRIPT);
      await generateText(
        withKrino(
          {
            model,
            tools: createLocalToolSet(),
            prompt: PROMPT,
            stopWhen: stepCountIs(5),
            prepareStep: ({ stepNumber }) =>
              stepNumber === 2 ? { activeTools: ["sendEmail"] } : undefined,
          },
          testKrino.krinoRuntime,
        ),
      );
      return model;
    };

    const firstModel = await runOnce();
    await runOnce();

    expect(sentToolNamesByCall(firstModel.doGenerateCalls)).toEqual([
      ["getOrder", "cancelOrder"],
      ["getOrder", "cancelOrder"],
      ["sendEmail"],
    ]);
    const changeWarnings = warnSpy.mock.calls.filter(
      ([warningMessage]) => warningMessage === ACTIVE_TOOLS_CHANGED_WARNING,
    );
    expect(changeWarnings).toHaveLength(1);
    expect(ACTIVE_TOOLS_CHANGED_WARNING).toBe(
      "krino: activeTools changed after step 0; this breaks the prompt cache.",
    );
    await testKrino.waitForRunSummaries(2);
    const stepTwoTrace = testKrino
      .stepTraces()
      .find((stepTrace) => stepTrace.runIdentifier === "test-run-1" && stepTrace.stepNumber === 2);
    expect(stepTwoTrace?.availableToolNames).toEqual(["sendEmail"]);
  });

  it("does not warn when the caller resends the step-0 tool list", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const testKrino = createTestKrino();
    const model = createScriptedModel(THREE_STEP_SCRIPT);

    await generateText(
      withKrino(
        {
          model,
          tools: createLocalToolSet(),
          prompt: PROMPT,
          stopWhen: stepCountIs(5),
          // Same names in another order: the SDK sends tools in the tool set's order anyway.
          prepareStep: () => ({ activeTools: [...LOCAL_TOOL_NAMES].reverse() }),
        },
        testKrino.krinoRuntime,
      ),
    );

    expect(warnSpy).not.toHaveBeenCalledWith(ACTIVE_TOOLS_CHANGED_WARNING);
  });

  it("propagates an error thrown by the caller's prepareStep", async () => {
    const testKrino = createTestKrino();
    const callerError = new Error("caller prepareStep failed");

    await expect(
      generateText(
        withKrino(
          {
            model: createScriptedModel(THREE_STEP_SCRIPT),
            tools: createLocalToolSet(),
            prompt: PROMPT,
            prepareStep: () => {
              throw callerError;
            },
          },
          testKrino.krinoRuntime,
        ),
      ),
    ).rejects.toBe(callerError);
  });
});
