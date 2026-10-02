import { generateText, stepCountIs, type ToolSet, tool } from "ai";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { KrinoRuntime, PendingToolCall, RunHandle } from "../../contracts/index.js";
import { withKrino } from "./index.js";
import {
  createLocalToolSet,
  createRecordingTool,
  createScriptedModel,
  createTestKrino,
  type ScriptedStep,
  selectToolsAnswer,
  sentToolNamesByCall,
  type ToolExecution,
} from "./test-support.js";
import { wrapToolsForRiskGate } from "./wrap-tools.js";

const PROMPT = "Cancel order A-1.";

type RiskSpy = { krinoRuntime: KrinoRuntime; pendingToolCalls: Array<PendingToolCall> };

/** Wraps a runtime so the test sees every `checkToolCallRisk` call. */
function spyOnRiskGate(
  krinoRuntime: KrinoRuntime,
  replaceCheck?: RunHandle["checkToolCallRisk"],
): RiskSpy {
  const pendingToolCalls: Array<PendingToolCall> = [];
  return {
    pendingToolCalls,
    krinoRuntime: {
      flushAll: krinoRuntime.flushAll,
      startRun: (runStart): RunHandle => {
        const runHandle = krinoRuntime.startRun(runStart);
        return {
          ...runHandle,
          checkToolCallRisk: (pendingToolCall) => {
            pendingToolCalls.push(pendingToolCall);
            return (replaceCheck ?? runHandle.checkToolCallRisk)(pendingToolCall);
          },
        };
      },
    },
  };
}

/** A tool set whose names collide with `Object.prototype` members. */
function createPrototypeNamedToolSet(toolExecutions: Array<ToolExecution>): ToolSet {
  const toolSet: ToolSet = {};
  for (const toolName of ["constructor", "toString", "__proto__"]) {
    // defineProperty, so "__proto__" becomes an own key instead of setting the prototype.
    Object.defineProperty(toolSet, toolName, {
      value: createRecordingTool(toolName, toolExecutions),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return toolSet;
}

describe("withKrino risk gate", () => {
  it("shadow: records the tool call, then runs the original execute unchanged", async () => {
    const testKrino = createTestKrino();
    const spy = spyOnRiskGate(testKrino.krinoRuntime);
    const originalExecute = vi.fn(
      async (toolInput: { reference: string }, _executionOptions: { toolCallId: string }) => ({
        cancelled: toolInput.reference,
      }),
    );
    const tools = {
      cancelOrder: tool({
        description: "Cancels an order.",
        inputSchema: z.object({ reference: z.string() }),
        execute: originalExecute,
      }),
    };

    const result = await generateText(
      withKrino(
        {
          model: createScriptedModel([
            { toolCalls: [{ toolName: "cancelOrder", reference: "A-7" }] },
            { text: "Cancelled." },
          ]),
          tools,
          prompt: PROMPT,
          stopWhen: stepCountIs(5),
        },
        spy.krinoRuntime,
      ),
    );

    expect(originalExecute).toHaveBeenCalledTimes(1);
    expect(originalExecute.mock.calls[0]?.[0]).toEqual({ reference: "A-7" });
    expect(originalExecute.mock.calls[0]?.[1]).toMatchObject({ toolCallId: "call-0-0" });
    expect(result.steps[0]?.toolResults[0]?.output).toEqual({ cancelled: "A-7" });
    expect(spy.pendingToolCalls).toEqual([
      {
        runIdentifier: "test-run-1",
        stepNumber: 0,
        toolName: "cancelOrder",
        toolArguments: { reference: "A-7" },
      },
    ]);
    // The caller's tool object is never changed.
    expect(tools.cancelOrder.execute).toBe(originalExecute);

    await testKrino.waitForRunSummaries(1);
    const stepZero = testKrino.stepTraces().find((stepTrace) => stepTrace.stepNumber === 0);
    const riskRecord = stepZero?.decisions.find(
      (decisionRecord) => decisionRecord.decisionKind === "riskGate",
    );
    expect(riskRecord?.decisionMode).toBe("shadow");
    // No threshold for the tool: the suggestion fails closed.
    expect(riskRecord?.suggestedChoice).toBe("askHuman");
    expect(riskRecord?.appliedChoice).toBeNull();
  });

  it("records the step of each tool call", async () => {
    const testKrino = createTestKrino();
    const spy = spyOnRiskGate(testKrino.krinoRuntime);
    const script: Array<ScriptedStep> = [
      { toolCalls: [{ toolName: "getOrder" }] },
      { toolCalls: [{ toolName: "cancelOrder" }, { toolName: "sendEmail" }] },
      { text: "Done." },
    ];

    await generateText(
      withKrino(
        {
          model: createScriptedModel(script),
          tools: createLocalToolSet(),
          prompt: PROMPT,
          stopWhen: stepCountIs(5),
        },
        spy.krinoRuntime,
      ),
    );

    expect(
      spy.pendingToolCalls.map((pendingCall) => [pendingCall.stepNumber, pendingCall.toolName]),
    ).toEqual([
      [0, "getOrder"],
      [1, "cancelOrder"],
      [1, "sendEmail"],
    ]);
  });

  it("keeps an execute that streams its output (AsyncIterable)", async () => {
    const testKrino = createTestKrino();
    const tools = {
      countDown: tool({
        description: "Counts down.",
        inputSchema: z.object({ reference: z.string() }),
        execute: async function* () {
          yield { remaining: 1 };
          yield { remaining: 0 };
        },
      }),
    };

    const result = await generateText(
      withKrino(
        {
          model: createScriptedModel([
            { toolCalls: [{ toolName: "countDown" }] },
            { text: "Done." },
          ]),
          tools,
          prompt: PROMPT,
          stopWhen: stepCountIs(5),
        },
        testKrino.krinoRuntime,
      ),
    );

    expect(result.steps[0]?.toolResults[0]?.output).toEqual({ remaining: 0 });
  });

  it("still runs the tool when the risk check throws", async () => {
    const testKrino = createTestKrino();
    const spy = spyOnRiskGate(testKrino.krinoRuntime, () => {
      throw new Error("risk gate exploded");
    });
    const toolExecutions: Array<ToolExecution> = [];
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await generateText(
      withKrino(
        {
          model: createScriptedModel([{ toolCalls: [{ toolName: "getOrder" }] }, { text: "Ok" }]),
          tools: createLocalToolSet(toolExecutions),
          prompt: PROMPT,
          stopWhen: stepCountIs(5),
        },
        spy.krinoRuntime,
      ),
    );

    expect(toolExecutions).toEqual([{ toolName: "getOrder", toolInput: { reference: "A-1" } }]);
    vi.restoreAllMocks();
  });

  it("handles the tool names constructor, toString and __proto__", async () => {
    const testKrino = createTestKrino({
      decisionModes: { toolSelection: "enforce", riskGate: "shadow" },
      answerQuestion: selectToolsAnswer(["constructor", "toString", "__proto__"]),
    });
    const spy = spyOnRiskGate(testKrino.krinoRuntime);
    const toolExecutions: Array<ToolExecution> = [];
    const prototypeBefore = Object.getOwnPropertyNames(Object.prototype).sort();
    const model = createScriptedModel([
      {
        toolCalls: [
          { toolName: "constructor" },
          { toolName: "toString" },
          { toolName: "__proto__" },
        ],
      },
      { text: "Done." },
    ]);

    await generateText(
      withKrino(
        {
          model,
          tools: createPrototypeNamedToolSet(toolExecutions),
          prompt: PROMPT,
          stopWhen: stepCountIs(5),
        },
        spy.krinoRuntime,
      ),
    );

    expect(sentToolNamesByCall(model.doGenerateCalls)).toEqual([
      ["constructor", "toString", "__proto__"],
      ["constructor", "toString", "__proto__"],
    ]);
    expect(toolExecutions.map((toolExecution) => toolExecution.toolName)).toEqual([
      "constructor",
      "toString",
      "__proto__",
    ]);
    expect(spy.pendingToolCalls.map((pendingCall) => pendingCall.toolName)).toEqual([
      "constructor",
      "toString",
      "__proto__",
    ]);
    expect(Object.getOwnPropertyNames(Object.prototype).sort()).toEqual(prototypeBefore);
    expect(Object.prototype.toString.call({})).toBe("[object Object]");
    const [runSummary] = await testKrino.waitForRunSummaries(1);
    expect(runSummary?.usedToolNames).toEqual(["constructor", "toString", "__proto__"]);
  });

  it("does not treat prototype names as tools when the tool set lacks them", async () => {
    const testKrino = createTestKrino({
      decisionModes: { toolSelection: "enforce", riskGate: "shadow" },
      answerQuestion: selectToolsAnswer(["getOrder"]),
    });
    const model = createScriptedModel([{ text: "Nothing to do." }]);

    await generateText(
      withKrino(
        {
          model,
          tools: createLocalToolSet(),
          activeTools: ["getOrder", "constructor", "toString", "__proto__"] as Array<"getOrder">,
          prompt: PROMPT,
        },
        testKrino.krinoRuntime,
      ),
    );

    expect(sentToolNamesByCall(model.doGenerateCalls)).toEqual([["getOrder"]]);
  });
});

describe("wrapToolsForRiskGate", () => {
  it("passes a tool without execute through as the same object", () => {
    const clientSideTool = tool({
      description: "Asks the user.",
      inputSchema: z.object({ question: z.string() }),
      outputSchema: z.object({ answer: z.string() }),
    });
    const clientTools: ToolSet = { askUser: clientSideTool };
    const wrappedTools = wrapToolsForRiskGate(new Map(Object.entries(clientTools)), () => {});

    expect(wrappedTools.askUser).toBe(clientSideTool);
  });

  it("runs the original execute when the call is outside any krino run", async () => {
    const toolExecutions: Array<ToolExecution> = [];
    const onToolCall = vi.fn();
    const wrappedTools = wrapToolsForRiskGate(
      new Map(Object.entries(createLocalToolSet(toolExecutions))),
      onToolCall,
    );

    const output = await wrappedTools.getOrder?.execute?.(
      { reference: "A-9" },
      { toolCallId: "direct", messages: [], context: undefined },
    );

    expect(output).toEqual({ toolName: "getOrder", outcome: "done" });
    expect(onToolCall).toHaveBeenCalledWith({
      toolName: "getOrder",
      toolInput: { reference: "A-9" },
      toolCallId: "direct",
    });
    expect(toolExecutions).toHaveLength(1);
  });

  it("returns own properties only, even for __proto__", () => {
    const toolExecutions: Array<ToolExecution> = [];
    const wrappedTools = wrapToolsForRiskGate(
      new Map(Object.entries(createPrototypeNamedToolSet(toolExecutions))),
      () => {},
    );

    expect(Object.keys(wrappedTools)).toEqual(["constructor", "toString", "__proto__"]);
    expect(Object.getPrototypeOf(wrappedTools)).toBe(Object.prototype);
    expect(Object.hasOwn(wrappedTools, "__proto__")).toBe(true);
  });
});
