import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  DecisionQuestion,
  DecisionRequestOptions,
  RunStartOptions,
  StepContext,
} from "../../contracts/index.js";
import { DecisionProviderError, DecisionTimeoutError } from "../../contracts/index.js";
import { createKrinoRuntime } from "../../core/index.js";
import {
  createJevAiGatewayProvider,
  type JevAiGatewayProviderOptions,
  type JevEvaluationReport,
} from "./create-jev-ai-gateway-provider.js";
import { createFixtureFetch, type FixtureFetch, type JevFixtureName } from "./fixture-fetch.js";

// A placeholder, not a real key. Tests check it never leaks into errors or reports.
const TEST_API_KEY = "krino-test-key-not-real";

const stepContext: StepContext = {
  runIdentifier: "run-1",
  stepNumber: 0,
  taskText: "Email the weekly report.",
  availableTools: [
    { toolName: "search", toolDescription: "Search the web." },
    { toolName: "readFile", toolDescription: "Read a file." },
    { toolName: "sendEmail", toolDescription: "Send an email." },
  ],
  recentMessagesText: "user: please send the report",
};

function toolQuestion(toolName: string): DecisionQuestion {
  return {
    decisionKind: "toolSelection",
    questionText: `Does the agent need the tool "${toolName}"?`,
    options: null,
  };
}
const threeToolQuestions = ["search", "readFile", "sendEmail"].map(toolQuestion);
const choiceQuestion: DecisionQuestion = {
  decisionKind: "toolSelection",
  questionText: "Which tool should run first?",
  options: ["search", "readFile", "sendEmail"],
};

function requestOptions(
  optionFields: Partial<DecisionRequestOptions> = {},
): DecisionRequestOptions {
  return {
    timeoutInMilliseconds: 2_000,
    abortSignal: new AbortController().signal,
    ...optionFields,
  };
}

function providerServing(
  responses: ReadonlyArray<JevFixtureName | "hang">,
  optionFields: Partial<JevAiGatewayProviderOptions> = {},
): { fixtureFetch: FixtureFetch; jevProvider: ReturnType<typeof createJevAiGatewayProvider> } {
  const fixtureFetch = createFixtureFetch(responses);
  const jevProvider = createJevAiGatewayProvider({
    environment: { AI_GATEWAY_API_KEY: TEST_API_KEY },
    fetch: fixtureFetch.fetch,
    ...optionFields,
  });
  return { fixtureFetch, jevProvider };
}

async function rejectionOf(pendingAnswers: Promise<unknown>): Promise<unknown> {
  try {
    await pendingAnswers;
  } catch (rejection) {
    return rejection;
  }
  throw new Error("expected the call to reject");
}

beforeEach(() => {
  // Fail loudly if anything reaches for the real network.
  vi.stubGlobal("fetch", () => {
    throw new Error("network is disabled in unit tests");
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createJevAiGatewayProvider: answers", () => {
  it("sends one request with every question and maps boolean answers to yes/no", async () => {
    const { fixtureFetch, jevProvider } = providerServing(["tool-selection-three-tools"]);

    const answers = await jevProvider.askDecisionQuestions(
      threeToolQuestions,
      stepContext,
      requestOptions(),
    );

    expect(fixtureFetch.recordedRequests).toHaveLength(1);
    expect(
      answers.map(({ choice, probability, decisionModelVersion }) => ({
        choice,
        probability: Number(probability.toFixed(6)),
        decisionModelVersion,
      })),
    ).toEqual([
      { choice: "yes", probability: 0.97, decisionModelVersion: "typesafe-ai/jev-fixture-version" },
      { choice: "no", probability: 0.96, decisionModelVersion: "typesafe-ai/jev-fixture-version" },
      { choice: "yes", probability: 0.91, decisionModelVersion: "typesafe-ai/jev-fixture-version" },
    ]);
  });

  it("posts the evaluation request for typesafe-ai/jev to AI Gateway", async () => {
    const { fixtureFetch, jevProvider } = providerServing(["tool-selection-three-tools"]);

    await jevProvider.askDecisionQuestions(threeToolQuestions, stepContext, requestOptions());

    const [recordedRequest] = fixtureFetch.recordedRequests;
    expect(recordedRequest?.url).toBe("https://ai-gateway.vercel.sh/v4/ai/evaluation-model");
    expect(recordedRequest?.headers.get("ai-model-id")).toBe("typesafe-ai/jev");
    expect(recordedRequest?.headers.get("authorization")).toBe(`Bearer ${TEST_API_KEY}`);
    expect(recordedRequest?.body).toMatchObject({
      state: { task: "Email the weekly report.", recentMessages: "user: please send the report" },
      questions: {
        question_0: { type: "boolean", instructions: 'Does the agent need the tool "search"?' },
        question_2: { type: "boolean", instructions: 'Does the agent need the tool "sendEmail"?' },
      },
    });
  });

  it("maps a choice answer to the probability of the chosen option", async () => {
    const { jevProvider } = providerServing(["choice-with-distribution"]);

    const answers = await jevProvider.askDecisionQuestions(
      [choiceQuestion],
      stepContext,
      requestOptions(),
    );

    expect(answers).toMatchObject([{ choice: "readFile", probability: 0.83 }]);
  });

  it("falls back to the requested model identifier when the response names no model", async () => {
    const { jevProvider } = providerServing(["choice-with-distribution"], {
      modelIdentifier: "typesafe-ai/jev",
    });

    const [answer] = await jevProvider.askDecisionQuestions(
      [choiceQuestion],
      stepContext,
      requestOptions(),
    );

    expect(answer?.decisionModelVersion).toBe("typesafe-ai/jev");
  });

  it("reports the latency it measured on every answer", async () => {
    let monotonicNow = 1_000;
    const { jevProvider } = providerServing(["tool-selection-three-tools"], {
      monotonicTime: () => {
        monotonicNow += 37;
        return monotonicNow;
      },
    });

    const answers = await jevProvider.askDecisionQuestions(
      threeToolQuestions,
      stepContext,
      requestOptions(),
    );

    expect(answers.map((answer) => answer.latencyInMilliseconds)).toEqual([37, 37, 37]);
  });

  it("answers no questions without a request", async () => {
    const { fixtureFetch, jevProvider } = providerServing(["tool-selection-three-tools"]);

    await expect(
      jevProvider.askDecisionQuestions([], stepContext, requestOptions()),
    ).resolves.toEqual([]);
    expect(fixtureFetch.recordedRequests).toHaveLength(0);
  });

  it("is named after its model, so the runtime can price a request with no answer", () => {
    expect(createJevAiGatewayProvider().providerName).toBe("typesafe-ai/jev");
  });
});

describe("createJevAiGatewayProvider: evaluation report", () => {
  it("reports usage, cost metadata and the model version, without the key or state", async () => {
    const evaluationReports: Array<JevEvaluationReport> = [];
    const { jevProvider } = providerServing(["tool-selection-three-tools"], {
      onEvaluationReport: (evaluationReport) => {
        evaluationReports.push(evaluationReport);
      },
    });

    await jevProvider.askDecisionQuestions(threeToolQuestions, stepContext, requestOptions());

    expect(evaluationReports).toEqual([
      expect.objectContaining({
        decisionModelVersion: "typesafe-ai/jev-fixture-version",
        questionCount: 3,
        inputTokens: 412,
        outputTokens: 3,
        providerMetadata: { gateway: { cost: "0.0000173", marketCost: "0.0000173" } },
      }),
    ]);
    const reportText = JSON.stringify(evaluationReports);
    expect(reportText).not.toContain(TEST_API_KEY);
    expect(reportText).not.toContain("Email the weekly report.");
  });

  it("ignores a report callback that throws", async () => {
    const { jevProvider } = providerServing(["tool-selection-three-tools"], {
      onEvaluationReport: () => {
        throw new Error("callback bug");
      },
    });

    await expect(
      jevProvider.askDecisionQuestions(threeToolQuestions, stepContext, requestOptions()),
    ).resolves.toHaveLength(3);
  });

  it("reports nothing for an evaluation it could not map", async () => {
    const evaluationReports: Array<JevEvaluationReport> = [];
    const { jevProvider } = providerServing(["choice-without-distribution"], {
      onEvaluationReport: (evaluationReport) => {
        evaluationReports.push(evaluationReport);
      },
    });

    await rejectionOf(
      jevProvider.askDecisionQuestions([choiceQuestion], stepContext, requestOptions()),
    );

    expect(evaluationReports).toEqual([]);
  });
});

describe("createJevAiGatewayProvider: API key", () => {
  it("reads AI_GATEWAY_API_KEY on every call", async () => {
    const environment: Record<string, string | undefined> = {};
    const { fixtureFetch, jevProvider } = providerServing(["tool-selection-three-tools"], {
      environment,
    });

    await expect(
      jevProvider.askDecisionQuestions(threeToolQuestions, stepContext, requestOptions()),
    ).rejects.toThrow("AI_GATEWAY_API_KEY is not set");
    environment.AI_GATEWAY_API_KEY = TEST_API_KEY;
    await jevProvider.askDecisionQuestions(threeToolQuestions, stepContext, requestOptions());

    expect(fixtureFetch.recordedRequests).toHaveLength(1);
  });

  it("fails without a network call when the key is missing or blank", async () => {
    const { fixtureFetch, jevProvider } = providerServing(["tool-selection-three-tools"], {
      environment: { AI_GATEWAY_API_KEY: "   " },
    });

    const rejection = await rejectionOf(
      jevProvider.askDecisionQuestions(threeToolQuestions, stepContext, requestOptions()),
    );

    expect(rejection).toBeInstanceOf(DecisionProviderError);
    expect(fixtureFetch.recordedRequests).toHaveLength(0);
  });

  it("prefers an explicit apiKey option", async () => {
    const { fixtureFetch, jevProvider } = providerServing(["tool-selection-three-tools"], {
      apiKey: "explicit-test-key",
      environment: {},
    });

    await jevProvider.askDecisionQuestions(threeToolQuestions, stepContext, requestOptions());

    expect(fixtureFetch.recordedRequests[0]?.headers.get("authorization")).toBe(
      "Bearer explicit-test-key",
    );
  });

  it("never writes the key to the console", async () => {
    const consoleSpies = (["log", "info", "warn", "error", "debug"] as const).map((methodName) =>
      vi.spyOn(console, methodName).mockImplementation(() => {}),
    );
    const { jevProvider } = providerServing(["error-authentication"]);

    await rejectionOf(
      jevProvider.askDecisionQuestions(threeToolQuestions, stepContext, requestOptions()),
    );

    for (const consoleSpy of consoleSpies) {
      expect(JSON.stringify(consoleSpy.mock.calls)).not.toContain(TEST_API_KEY);
      consoleSpy.mockRestore();
    }
  });
});

describe("createJevAiGatewayProvider: errors map to DecisionProviderError", () => {
  it.each([
    ["an authentication error", "error-authentication", /HTTP 401/],
    ["a rate limit", "error-rate-limit", /HTTP 429/],
    ["a missing answer", "missing-answer", /Jev request failed/],
  ] as const)("%s", async (_label, fixtureName, messagePattern) => {
    const { jevProvider } = providerServing([fixtureName]);

    const rejection = await rejectionOf(
      jevProvider.askDecisionQuestions(threeToolQuestions, stepContext, requestOptions()),
    );

    expect(rejection).toBeInstanceOf(DecisionProviderError);
    expect(rejection).toMatchObject({ providerName: "typesafe-ai/jev" });
    expect(String(rejection)).toMatch(messagePattern);
    expect(String(rejection)).not.toContain(TEST_API_KEY);
  });

  it("does not attach the AI SDK error, which carries the unredacted request body", async () => {
    const { jevProvider } = providerServing(["error-rate-limit"]);

    const rejection = await rejectionOf(
      jevProvider.askDecisionQuestions(threeToolQuestions, stepContext, requestOptions()),
    );

    expect(rejection).toBeInstanceOf(DecisionProviderError);
    const causeText = JSON.stringify((rejection as DecisionProviderError).cause);
    expect(causeText).toContain("429");
    expect(causeText).not.toContain("Email the weekly report.");
    expect(causeText).not.toContain(TEST_API_KEY);
  });

  it("does not retry by default: a decision has a short deadline", async () => {
    const { fixtureFetch, jevProvider } = providerServing(["error-rate-limit"]);

    await rejectionOf(
      jevProvider.askDecisionQuestions(threeToolQuestions, stepContext, requestOptions()),
    );

    expect(fixtureFetch.recordedRequests).toHaveLength(1);
  });

  it("retries when maxRetries is set", async () => {
    const { fixtureFetch, jevProvider } = providerServing(
      ["error-rate-limit", "tool-selection-three-tools"],
      { maxRetries: 1 },
    );

    // The AI SDK waits before a retry; fake timers skip the wait.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const pendingAnswers = jevProvider.askDecisionQuestions(
        threeToolQuestions,
        stepContext,
        requestOptions({ timeoutInMilliseconds: 60_000 }),
      );
      await vi.advanceTimersByTimeAsync(30_000);

      await expect(pendingAnswers).resolves.toHaveLength(3);
      expect(fixtureFetch.recordedRequests).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("fails a choice answer that has no probability distribution", async () => {
    const { jevProvider } = providerServing(["choice-without-distribution"]);

    const rejection = await rejectionOf(
      jevProvider.askDecisionQuestions([choiceQuestion], stepContext, requestOptions()),
    );

    expect(rejection).toBeInstanceOf(DecisionProviderError);
    expect(String(rejection)).toMatch(/no probability/);
  });

  it("fails a malformed choice question before any request", async () => {
    const { fixtureFetch, jevProvider } = providerServing(["choice-with-distribution"]);

    await expect(
      jevProvider.askDecisionQuestions(
        [{ ...choiceQuestion, options: [] }],
        stepContext,
        requestOptions(),
      ),
    ).rejects.toBeInstanceOf(DecisionProviderError);
    expect(fixtureFetch.recordedRequests).toHaveLength(0);
  });
});

describe("createJevAiGatewayProvider: abort and timeout cancel the HTTP request", () => {
  it("cancels the request when the caller aborts", async () => {
    const abortController = new AbortController();
    const { fixtureFetch, jevProvider } = providerServing(["hang"]);

    const pendingAnswers = jevProvider.askDecisionQuestions(
      threeToolQuestions,
      stepContext,
      requestOptions({ abortSignal: abortController.signal }),
    );
    await vi.waitFor(() => {
      expect(fixtureFetch.recordedRequests).toHaveLength(1);
    });
    abortController.abort();
    const rejection = await rejectionOf(pendingAnswers);

    expect(rejection).toBeInstanceOf(DecisionProviderError);
    expect(String(rejection)).toMatch(/aborted/);
    expect(fixtureFetch.recordedRequests[0]?.signal?.aborted).toBe(true);
    expect(fixtureFetch.recordedRequests[0]?.requestOutcome).toBe("aborted");
  });

  it("cancels the request at its own timeout and rejects with DecisionTimeoutError", async () => {
    const { fixtureFetch, jevProvider } = providerServing(["hang"]);

    const rejection = await rejectionOf(
      jevProvider.askDecisionQuestions(
        threeToolQuestions,
        stepContext,
        requestOptions({ timeoutInMilliseconds: 20 }),
      ),
    );

    expect(rejection).toBeInstanceOf(DecisionTimeoutError);
    expect(rejection).toMatchObject({ timeoutInMilliseconds: 20 });
    expect(fixtureFetch.recordedRequests[0]?.requestOutcome).toBe("aborted");
  });

  it("makes no request when the signal is already aborted", async () => {
    const abortController = new AbortController();
    abortController.abort();
    const { fixtureFetch, jevProvider } = providerServing(["tool-selection-three-tools"]);

    await expect(
      jevProvider.askDecisionQuestions(
        threeToolQuestions,
        stepContext,
        requestOptions({ abortSignal: abortController.signal }),
      ),
    ).rejects.toBeInstanceOf(DecisionProviderError);
    expect(fixtureFetch.recordedRequests).toHaveLength(0);
  });
});

describe("createJevAiGatewayProvider inside the runtime (behavior rules)", () => {
  const runStart: RunStartOptions = {
    hostName: "ai-sdk",
    hostSdkVersion: "7.0.126",
    capabilities: {
      supportedDecisions: ["toolSelection"],
      toolSelectionTiming: "perStep",
      reportsPerStepUsage: true,
    },
  };

  function runtimeWith(
    jevProvider: ReturnType<typeof createJevAiGatewayProvider>,
    decisionTimeoutInMilliseconds: number,
  ) {
    return createKrinoRuntime(
      {
        projectName: "jev-provider-test",
        decisionModes: { toolSelection: "enforce" },
        explorationRate: 0,
        minimumConfidence: 0.9,
        decisionTimeoutInMilliseconds,
        decisionProvider: jevProvider,
        traceSink: { writeRecord: () => {}, flush: async () => {} },
      },
      { warn: () => {} },
    );
  }

  it("enforce: a confident Jev answer narrows the tools on step 0", async () => {
    const { jevProvider } = providerServing(["tool-selection-three-tools"]);
    const runHandle = runtimeWith(jevProvider, 2_000).startRun(runStart);

    const outcome = await runHandle.decideToolSelection(stepContext);

    expect(outcome).toMatchObject({
      toolNamesToSend: ["search", "sendEmail"],
      decisionRecord: {
        decisionStatus: "answered",
        decisionModelVersion: "typesafe-ai/jev-fixture-version",
        appliedChoice: "search,sendEmail",
      },
    });
  });

  it("enforce timeout: sends all tools as timedOut and cancels the HTTP request", async () => {
    const { fixtureFetch, jevProvider } = providerServing(["hang"]);
    const runHandle = runtimeWith(jevProvider, 30).startRun(runStart);

    const outcome = await runHandle.decideToolSelection(stepContext);

    expect(outcome).toMatchObject({
      toolNamesToSend: ["search", "readFile", "sendEmail"],
      decisionRecord: { decisionMode: "enforce", decisionStatus: "timedOut" },
    });
    // Not only ignored: the fetch itself was aborted.
    expect(fixtureFetch.recordedRequests).toHaveLength(1);
    expect(fixtureFetch.recordedRequests[0]?.signal?.aborted).toBe(true);
    await vi.waitFor(() => {
      expect(fixtureFetch.recordedRequests[0]?.requestOutcome).toBe("aborted");
    });
  });

  it("enforce error: sends all tools as failed", async () => {
    const { jevProvider } = providerServing(["error-rate-limit"]);
    const runHandle = runtimeWith(jevProvider, 2_000).startRun(runStart);

    const outcome = await runHandle.decideToolSelection(stepContext);

    expect(outcome).toMatchObject({
      toolNamesToSend: ["search", "readFile", "sendEmail"],
      decisionRecord: { decisionStatus: "failed" },
    });
  });
});
