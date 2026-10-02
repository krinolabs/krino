import { generateText, stepCountIs, streamText } from "ai";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { OPTIONS_REUSED_WARNING } from "./call-runs.js";
import { withKrino } from "./index.js";
import {
  createLocalToolSet,
  createScriptedModel,
  createTestKrino,
  type ScriptedStep,
  selectToolsAnswer,
} from "./test-support.js";
import { resetWarningsForTesting } from "./warn-once.js";

const THREE_STEP_SCRIPT: Array<ScriptedStep> = [
  { toolCalls: [{ toolName: "getOrder" }] },
  { toolCalls: [{ toolName: "cancelOrder" }] },
  { text: "Order A-1 is cancelled." },
];

describe("withKrino options reused across calls", () => {
  let warnSpy: MockInstance<typeof console.warn>;

  beforeEach(() => {
    resetWarningsForTesting();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const reuseWarnings = (): number =>
    warnSpy.mock.calls.filter(([warningMessage]) => warningMessage === OPTIONS_REUSED_WARNING)
      .length;

  it("starts a separate run for a second call while the first is active, and warns once", async () => {
    const testKrino = createTestKrino({
      decisionModes: { toolSelection: "enforce", riskGate: "shadow" },
      answerQuestion: selectToolsAnswer(["getOrder", "cancelOrder"]),
    });
    const krinoOptions = withKrino(
      {
        model: createScriptedModel(THREE_STEP_SCRIPT),
        tools: createLocalToolSet(),
        prompt: "Cancel order A-1.",
        stopWhen: stepCountIs(5),
      },
      testKrino.krinoRuntime,
    );

    await Promise.all([
      generateText(krinoOptions),
      generateText(krinoOptions),
      streamText(krinoOptions).consumeStream(),
    ]);

    const runSummaries = await testKrino.waitForRunSummaries(3);
    expect(new Set(runSummaries.map((runSummary) => runSummary.runIdentifier)).size).toBe(3);
    for (const runSummary of runSummaries) {
      expect(runSummary.stepCount).toBe(3);
      expect(runSummary.usedToolNames).toEqual(["getOrder", "cancelOrder"]);
      const runSteps = testKrino
        .stepTraces()
        .filter((stepTrace) => stepTrace.runIdentifier === runSummary.runIdentifier)
        .map((stepTrace) => stepTrace.stepNumber)
        .sort();
      // Each run has its own steps 0, 1 and 2: no trace is mixed into another run.
      expect(runSteps).toEqual([0, 1, 2]);
      const toolSelections = testKrino
        .stepTraces()
        .filter((stepTrace) => stepTrace.runIdentifier === runSummary.runIdentifier)
        .flatMap((stepTrace) => stepTrace.decisions)
        .filter((decisionRecord) => decisionRecord.decisionKind === "toolSelection");
      expect(toolSelections).toHaveLength(1);
      const riskChecks = testKrino
        .stepTraces()
        .filter((stepTrace) => stepTrace.runIdentifier === runSummary.runIdentifier)
        .flatMap((stepTrace) => stepTrace.decisions)
        .filter((decisionRecord) => decisionRecord.decisionKind === "riskGate");
      expect(riskChecks).toHaveLength(2);
    }
    expect(reuseWarnings()).toBe(1);
  });

  it("does not warn when the options are reused after the previous run finished", async () => {
    const testKrino = createTestKrino();
    const krinoOptions = withKrino(
      {
        model: createScriptedModel(THREE_STEP_SCRIPT),
        tools: createLocalToolSet(),
        prompt: "Cancel order A-1.",
        stopWhen: stepCountIs(5),
      },
      testKrino.krinoRuntime,
    );

    await generateText(krinoOptions);
    await generateText(krinoOptions);

    const runSummaries = await testKrino.waitForRunSummaries(2);
    expect(runSummaries.map((runSummary) => runSummary.stepCount)).toEqual([3, 3]);
    expect(reuseWarnings()).toBe(0);
  });
});
