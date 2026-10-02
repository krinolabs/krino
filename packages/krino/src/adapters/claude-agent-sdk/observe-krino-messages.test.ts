import type { HookCallback, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  answerToolsNeeded,
  createLocalTestProvider,
  TEST_DECISION_MODEL_VERSION,
} from "../../core/local-test-doubles.js";
import { type KrinoAgentRun, krinoAgentOptions } from "./krino-agent-options.js";
import { observeKrinoMessages } from "./observe-krino-messages.js";
import {
  APPROVE_REFUND,
  assistantTextMessage,
  BENCH_TOOL_DESCRIPTIONS,
  CANCEL_ORDER,
  callHook,
  createTestKrino,
  fakeMessageStream,
  GET_ORDER_DETAILS,
  modelUsage,
  resultMessage,
  systemInitMessage,
  TASK_TEXT,
} from "./test-support.js";
import { forgetWarningsForTests } from "./warn-once.js";

const HAIKU = "claude-haiku-4-5";
const SONNET = "claude-sonnet-5-5";

const haikuRunResult = resultMessage({
  modelUsage: {
    [HAIKU]: modelUsage({
      inputTokens: 1_200,
      outputTokens: 300,
      cacheReadInputTokens: 8_000,
      cacheCreationInputTokens: 2_500,
    }),
  },
  totalCostInUsd: 0.0123,
  turnCount: 3,
});

let consoleWarn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  forgetWarningsForTests();
  consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function krinoHookOf(krinoRun: KrinoAgentRun): HookCallback {
  const krinoHook = krinoRun.queryOptions.hooks?.PreToolUse?.at(-1)?.hooks[0];
  if (krinoHook === undefined) {
    throw new Error("krino's PreToolUse hook is missing");
  }
  return krinoHook;
}

type FakeRun = {
  toolNames?: Array<string>;
  finalMessages?: Array<SDKMessage>;
  failAfter?: number;
};

/**
 * Plays a run the way the SDK would: an init message, one assistant message per tool call with
 * krino's PreToolUse hook called just before it, then the final messages.
 */
function fakeAgentStream(krinoRun: KrinoAgentRun, fakeRun: FakeRun) {
  const toolNames = fakeRun.toolNames ?? [];
  const krinoHook = krinoHookOf(krinoRun);
  const messages = [
    systemInitMessage(HAIKU, toolNames),
    ...toolNames.map((toolName) => assistantTextMessage(`calling ${toolName}`)),
    ...(fakeRun.finalMessages ?? [haikuRunResult]),
  ];
  const streamOptions: Parameters<typeof fakeMessageStream>[1] = {
    beforeMessage: async (messageIndex) => {
      const toolName = toolNames[messageIndex - 1];
      if (toolName !== undefined) {
        await callHook(krinoHook, toolName);
      }
    },
  };
  if (fakeRun.failAfter !== undefined) {
    streamOptions.failAfter = fakeRun.failAfter;
  }
  return { messages, stream: fakeMessageStream(messages, streamOptions) };
}

async function collect(messageStream: AsyncIterable<SDKMessage>): Promise<Array<SDKMessage>> {
  const seenMessages: Array<SDKMessage> = [];
  for await (const message of messageStream) {
    seenMessages.push(message);
  }
  return seenMessages;
}

async function startRun(
  testOptions: Parameters<typeof createTestKrino>[0] = {},
  model: string | null = HAIKU,
) {
  const testKrino = createTestKrino(testOptions);
  const krinoRun = await krinoAgentOptions(
    model === null ? {} : { model },
    testKrino.krinoRuntime,
    TASK_TEXT,
    { toolDescriptions: BENCH_TOOL_DESCRIPTIONS },
  );
  return { ...testKrino, krinoRun };
}

describe("observeKrinoMessages", () => {
  it("passes every message through unchanged and in order", async () => {
    const { krinoRun } = await startRun();
    const { messages, stream } = fakeAgentStream(krinoRun, { toolNames: [CANCEL_ORDER] });
    const seenMessages = await collect(observeKrinoMessages(stream, krinoRun));
    expect(seenMessages).toHaveLength(messages.length);
    seenMessages.forEach((seenMessage, messageIndex) => {
      expect(seenMessage).toBe(messages[messageIndex]);
    });
  });

  it("writes step 0, one step per tool call, then the run summary", async () => {
    const { krinoRun, traceSink } = await startRun();
    const { stream } = fakeAgentStream(krinoRun, {
      toolNames: [GET_ORDER_DETAILS, CANCEL_ORDER],
    });
    await collect(observeKrinoMessages(stream, krinoRun));

    const runIdentifier = krinoRun.runHandle.runIdentifier;
    // The runtime writes a step once its decisions settle, so sort by step number.
    const stepTraces = traceSink
      .stepTraces()
      .sort((firstStep, secondStep) => firstStep.stepNumber - secondStep.stepNumber);
    expect(stepTraces.map((stepTrace) => stepTrace.stepNumber)).toEqual([0, 1, 2]);
    expect(stepTraces[0]).toMatchObject({
      runIdentifier,
      stepNumber: 0,
      hostName: "claude-agent-sdk",
      hostSdkVersion: "0.3.286",
      modelIdentifier: HAIKU,
      availableToolNames: BENCH_TOOL_DESCRIPTIONS.map(
        (toolDescription) => toolDescription.toolName,
      ),
      chosenToolNames: [],
      tokenUsage: null,
      costInUsd: null,
      contentHash: null,
    });
    expect(stepTraces[0]?.decisions).toEqual([
      expect.objectContaining({
        decisionKind: "toolSelection",
        decisionMode: "shadow",
        decisionStatus: "answered",
        suggestedChoice: CANCEL_ORDER,
        decisionModelVersion: TEST_DECISION_MODEL_VERSION,
      }),
    ]);
    expect(stepTraces[1]).toMatchObject({
      stepNumber: 1,
      chosenToolNames: [GET_ORDER_DETAILS],
      tokenUsage: null,
      decisions: [expect.objectContaining({ decisionKind: "riskGate", decisionMode: "shadow" })],
    });
    expect(stepTraces[2]).toMatchObject({ stepNumber: 2, chosenToolNames: [CANCEL_ORDER] });

    expect(traceSink.runSummaries()).toEqual([
      expect.objectContaining({
        recordType: "runSummary",
        runIdentifier,
        hostName: "claude-agent-sdk",
        hostSdkVersion: "0.3.286",
        modelIdentifier: HAIKU,
        totalTokenUsage: {
          inputTokens: 1_200,
          outputTokens: 300,
          cacheReadTokens: 8_000,
          cacheWriteTokens: 2_500,
        },
        totalCostInUsd: 0.0123,
        stepCount: 3,
        usedToolNames: [CANCEL_ORDER, GET_ORDER_DETAILS],
        // get_order_details was used but not suggested.
        toolSelectionAgreement: false,
      }),
    ]);
  });

  it("toolSelectionAgreement is true when every used tool was suggested", async () => {
    const { krinoRun, traceSink } = await startRun();
    const { stream } = fakeAgentStream(krinoRun, { toolNames: [CANCEL_ORDER, CANCEL_ORDER] });
    await collect(observeKrinoMessages(stream, krinoRun));
    expect(traceSink.runSummaries()[0]?.toolSelectionAgreement).toBe(true);
  });

  it("toolSelectionAgreement is null without toolDescriptions (no suggestion)", async () => {
    const { krinoRuntime, traceSink } = createTestKrino();
    const krinoRun = await krinoAgentOptions({ model: HAIKU }, krinoRuntime, TASK_TEXT);
    const { stream } = fakeAgentStream(krinoRun, { toolNames: [CANCEL_ORDER] });
    await collect(observeKrinoMessages(stream, krinoRun));
    expect(traceSink.stepTraces()[0]).toMatchObject({
      availableToolNames: [],
      decisions: [expect.objectContaining({ decisionStatus: "skippedUnsupported" })],
    });
    expect(traceSink.runSummaries()[0]?.toolSelectionAgreement).toBeNull();
  });

  it("without a model option, the main model is the one with the most input tokens", async () => {
    const { krinoRun, traceSink } = await startRun({}, null);
    const { stream } = fakeAgentStream(krinoRun, {
      toolNames: [CANCEL_ORDER],
      finalMessages: [
        resultMessage({
          modelUsage: {
            [HAIKU]: modelUsage({ inputTokens: 900 }),
            [SONNET]: modelUsage({ inputTokens: 100, cacheReadInputTokens: 5_000 }),
          },
          totalCostInUsd: 0.02,
          turnCount: 2,
        }),
      ],
    });
    await collect(observeKrinoMessages(stream, krinoRun));
    expect(traceSink.runSummaries()[0]?.modelIdentifier).toBe(SONNET);
    expect(traceSink.stepTraces().map((stepTrace) => stepTrace.modelIdentifier)).toEqual([
      SONNET,
      SONNET,
    ]);
  });

  it("reads the last result message; the totals are cumulative", async () => {
    const { krinoRun, traceSink } = await startRun();
    const { stream } = fakeAgentStream(krinoRun, {
      finalMessages: [
        resultMessage({
          modelUsage: { [HAIKU]: modelUsage({ inputTokens: 10 }) },
          totalCostInUsd: 0.001,
          turnCount: 1,
        }),
        haikuRunResult,
      ],
    });
    await collect(observeKrinoMessages(stream, krinoRun));
    expect(traceSink.runSummaries()[0]).toMatchObject({
      totalCostInUsd: 0.0123,
      stepCount: 3,
      totalTokenUsage: { inputTokens: 1_200 },
    });
  });

  it("an error result still carries usage and cost", async () => {
    const { krinoRun, traceSink } = await startRun();
    const { stream } = fakeAgentStream(krinoRun, {
      finalMessages: [
        resultMessage({
          modelUsage: { [HAIKU]: modelUsage({ inputTokens: 40 }) },
          totalCostInUsd: 0.0005,
          turnCount: 1,
          subtype: "error_during_execution",
        }),
      ],
    });
    await collect(observeKrinoMessages(stream, krinoRun));
    expect(traceSink.runSummaries()[0]).toMatchObject({
      totalCostInUsd: 0.0005,
      totalTokenUsage: { inputTokens: 40 },
    });
  });

  it("a stream that throws still writes the run summary, then rethrows the host's error", async () => {
    const { krinoRun, traceSink } = await startRun();
    const { stream } = fakeAgentStream(krinoRun, { toolNames: [CANCEL_ORDER], failAfter: 2 });
    await expect(collect(observeKrinoMessages(stream, krinoRun))).rejects.toThrow("stream broke");
    expect(
      traceSink
        .stepTraces()
        .map((stepTrace) => stepTrace.stepNumber)
        .sort(),
    ).toEqual([0, 1]);
    expect(traceSink.runSummaries()).toEqual([
      expect.objectContaining({
        modelIdentifier: HAIKU,
        totalTokenUsage: {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        totalCostInUsd: 0,
        stepCount: 1,
        usedToolNames: [CANCEL_ORDER],
      }),
    ]);
  });

  it("breaking out of the loop early still writes the run summary", async () => {
    const { krinoRun, traceSink } = await startRun();
    const { stream } = fakeAgentStream(krinoRun, { toolNames: [CANCEL_ORDER, APPROVE_REFUND] });
    for await (const message of observeKrinoMessages(stream, krinoRun)) {
      if (message.type === "assistant") {
        break;
      }
    }
    expect(traceSink.runSummaries()).toHaveLength(1);
    expect(traceSink.runSummaries()[0]?.usedToolNames).toEqual([CANCEL_ORDER]);
  });

  it("without a model option or a result, the model is unknown", async () => {
    const { krinoRun, traceSink } = await startRun({}, null);
    const { stream } = fakeAgentStream(krinoRun, { finalMessages: [] });
    await collect(observeKrinoMessages(stream, krinoRun));
    expect(traceSink.runSummaries()[0]).toMatchObject({ modelIdentifier: "unknown", stepCount: 0 });
  });

  it("observing the same run twice writes one run summary", async () => {
    const { krinoRun, traceSink } = await startRun();
    await collect(observeKrinoMessages(fakeAgentStream(krinoRun, {}).stream, krinoRun));
    await collect(observeKrinoMessages(fakeAgentStream(krinoRun, {}).stream, krinoRun));
    expect(traceSink.runSummaries()).toHaveLength(1);
    expect(traceSink.stepTraces()).toHaveLength(1);
  });

  it("a run krino did not start passes messages through and warns once", async () => {
    const { krinoRun } = await startRun();
    const foreignRun: KrinoAgentRun = { ...krinoRun };
    const messages = [assistantTextMessage("hello")];
    await expect(
      collect(observeKrinoMessages(fakeMessageStream(messages), foreignRun)),
    ).resolves.toEqual(messages);
    await collect(observeKrinoMessages(fakeMessageStream(messages), foreignRun));
    expect(consoleWarn).toHaveBeenCalledTimes(1);
    expect(consoleWarn).toHaveBeenCalledWith(
      "krino: observeKrinoMessages() got a run that krinoAgentOptions() did not return; " +
        "nothing is recorded. Pass the object krinoAgentOptions() resolved to.",
    );
  });

  it("never throws into the host when recording fails", async () => {
    const { krinoRun } = await startRun();
    krinoRun.runHandle.finishRun = async () => {
      throw new Error("sink broke");
    };
    const { messages, stream } = fakeAgentStream(krinoRun, {});
    await expect(collect(observeKrinoMessages(stream, krinoRun))).resolves.toHaveLength(
      messages.length,
    );
    expect(consoleWarn).toHaveBeenCalledWith(
      "krino: failed to finish the Claude Agent SDK run: Error: sink broke",
    );
  });
});

describe("no network", () => {
  it("a full shadow and enforce run never calls fetch", async () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error("network is not allowed in tests")));
    vi.stubGlobal("fetch", fetchSpy);
    try {
      for (const toolSelectionMode of ["shadow", "enforce"] as const) {
        const { krinoRun, traceSink } = await startRun({
          toolSelectionMode,
          decisionProvider: createLocalTestProvider(answerToolsNeeded([CANCEL_ORDER], 0.95)),
        });
        const { stream } = fakeAgentStream(krinoRun, { toolNames: [CANCEL_ORDER] });
        await collect(observeKrinoMessages(stream, krinoRun));
        expect(traceSink.runSummaries()).toHaveLength(1);
      }
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
