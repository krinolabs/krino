import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  DecisionQuestion,
  DecisionRequestOptions,
  StepContext,
} from "../../contracts/index.js";
import { DecisionProviderError, DecisionTimeoutError } from "../../contracts/index.js";
import { createKrinoRuntime } from "../../core/index.js";
import {
  createFakeDecisionProvider,
  FAKE_DECISION_MODEL_VERSION,
  FAKE_PROVIDER_NAME,
} from "./index.js";

const stepContext: StepContext = {
  runIdentifier: "run-1",
  stepNumber: 0,
  taskText: "Email the weekly report.",
  availableTools: [
    { toolName: "search", toolDescription: "Search the web." },
    { toolName: "sendEmail", toolDescription: "Send an email." },
  ],
  recentMessagesText: "user: please send the report",
};

const searchQuestion: DecisionQuestion = {
  decisionKind: "toolSelection",
  questionText: 'Does the agent need the tool "search"?',
  options: null,
};
const sendEmailQuestion: DecisionQuestion = {
  decisionKind: "toolSelection",
  questionText: 'Does the agent need the tool "sendEmail"?',
  options: null,
};
const riskQuestion: DecisionQuestion = {
  decisionKind: "riskGate",
  questionText: 'Is it safe to run the tool "sendEmail"?',
  options: null,
};
const choiceQuestion: DecisionQuestion = {
  decisionKind: "toolSelection",
  questionText: "Which tool first?",
  options: ["search", "sendEmail"],
};

function requestOptions(
  optionFields: Partial<DecisionRequestOptions> = {},
): DecisionRequestOptions {
  return {
    timeoutInMilliseconds: 800,
    abortSignal: new AbortController().signal,
    ...optionFields,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createFakeDecisionProvider: scripted answers", () => {
  it("answers by exact question text, one answer per question, in order", async () => {
    const fakeProvider = createFakeDecisionProvider({
      answersByQuestionText: {
        [searchQuestion.questionText]: { choice: "no", probability: 0.9 },
        [sendEmailQuestion.questionText]: { choice: "yes", probability: 0.95 },
      },
    });

    const answers = fakeProvider.askDecisionQuestions(
      [sendEmailQuestion, searchQuestion],
      stepContext,
      requestOptions(),
    );
    await vi.advanceTimersByTimeAsync(0);

    await expect(answers).resolves.toEqual([
      {
        choice: "yes",
        probability: 0.95,
        decisionModelVersion: FAKE_DECISION_MODEL_VERSION,
        latencyInMilliseconds: 0,
      },
      {
        choice: "no",
        probability: 0.9,
        decisionModelVersion: FAKE_DECISION_MODEL_VERSION,
        latencyInMilliseconds: 0,
      },
    ]);
  });

  it("answers by function when no exact match exists, and passes the step context", async () => {
    const answerQuestion = vi.fn((decisionQuestion: DecisionQuestion) =>
      decisionQuestion.questionText.includes('"search"') ? { choice: "yes", probability: 1 } : null,
    );
    const fakeProvider = createFakeDecisionProvider({
      answersByQuestionText: { [sendEmailQuestion.questionText]: { choice: "no", probability: 1 } },
      answerQuestion,
    });

    const answers = fakeProvider.askDecisionQuestions(
      [searchQuestion, sendEmailQuestion],
      stepContext,
      requestOptions(),
    );
    await vi.advanceTimersByTimeAsync(0);

    expect((await answers).map((answer) => answer.choice)).toEqual(["yes", "no"]);
    expect(answerQuestion).toHaveBeenCalledTimes(1);
    expect(answerQuestion).toHaveBeenCalledWith(searchQuestion, stepContext);
  });

  it("answers unscripted questions conservatively: keep the tool, not safe, first option", async () => {
    const fakeProvider = createFakeDecisionProvider();

    const answers = fakeProvider.askDecisionQuestions(
      [searchQuestion, riskQuestion, choiceQuestion],
      stepContext,
      requestOptions(),
    );
    await vi.advanceTimersByTimeAsync(0);

    expect((await answers).map(({ choice, probability }) => ({ choice, probability }))).toEqual([
      { choice: "yes", probability: 0.5 },
      { choice: "no", probability: 0.5 },
      { choice: "search", probability: 0.5 },
    ]);
  });

  it("rejects the whole call when an unscripted question meets the `fail` rule", async () => {
    const fakeProvider = createFakeDecisionProvider({
      answersByQuestionText: { [searchQuestion.questionText]: { choice: "yes", probability: 1 } },
      unscriptedQuestionRule: "fail",
    });

    const answers = fakeProvider.askDecisionQuestions(
      [searchQuestion, riskQuestion],
      stepContext,
      requestOptions(),
    );
    const assertion = expect(answers).rejects.toBeInstanceOf(DecisionProviderError);
    await vi.advanceTimersByTimeAsync(0);

    await assertion;
    expect(fakeProvider.recordedCalls[0]?.callOutcome).toBe("failed");
  });

  it("uses the configured provider name and decision model version", async () => {
    const fakeProvider = createFakeDecisionProvider({
      providerName: "fake-jev",
      decisionModelVersion: "jev-fixture-7",
    });

    const answers = fakeProvider.askDecisionQuestions(
      [searchQuestion],
      stepContext,
      requestOptions(),
    );
    await vi.advanceTimersByTimeAsync(0);

    expect(fakeProvider.providerName).toBe("fake-jev");
    expect((await answers)[0]?.decisionModelVersion).toBe("jev-fixture-7");
  });
});

describe("createFakeDecisionProvider: latency, timeout, errors, abort", () => {
  it("answers after the configured latency and reports it", async () => {
    const fakeProvider = createFakeDecisionProvider({ latencyInMilliseconds: 120 });
    let settledLatency: number | null = null;

    void fakeProvider
      .askDecisionQuestions([searchQuestion], stepContext, requestOptions())
      .then((answers) => {
        settledLatency = answers[0]?.latencyInMilliseconds ?? null;
      });
    await vi.advanceTimersByTimeAsync(119);
    expect(settledLatency).toBeNull();
    await vi.advanceTimersByTimeAsync(1);

    expect(settledLatency).toBe(120);
  });

  it("simulates a timeout: rejects with DecisionTimeoutError at the request timeout", async () => {
    const fakeProvider = createFakeDecisionProvider({ simulateTimeout: true });

    const answers = fakeProvider.askDecisionQuestions(
      [searchQuestion],
      stepContext,
      requestOptions({ timeoutInMilliseconds: 300 }),
    );
    const assertion = expect(answers).rejects.toMatchObject({
      name: "DecisionTimeoutError",
      providerName: FAKE_PROVIDER_NAME,
      timeoutInMilliseconds: 300,
    });
    await vi.advanceTimersByTimeAsync(300);

    await assertion;
    expect(fakeProvider.recordedCalls[0]?.callOutcome).toBe("timedOut");
  });

  it("times out when the latency is longer than the request timeout", async () => {
    const fakeProvider = createFakeDecisionProvider({ latencyInMilliseconds: 5_000 });

    const answers = fakeProvider.askDecisionQuestions(
      [searchQuestion],
      stepContext,
      requestOptions({ timeoutInMilliseconds: 100 }),
    );
    const assertion = expect(answers).rejects.toBeInstanceOf(DecisionTimeoutError);
    await vi.advanceTimersByTimeAsync(100);

    await assertion;
  });

  it("injects errors per call", async () => {
    const injectedError = new Error("injected outage");
    const fakeProvider = createFakeDecisionProvider({
      injectError: (fakeProviderCall) => (fakeProviderCall.callNumber === 1 ? injectedError : null),
    });

    const firstAnswers = fakeProvider.askDecisionQuestions(
      [searchQuestion],
      stepContext,
      requestOptions(),
    );
    const firstAssertion = expect(firstAnswers).rejects.toBe(injectedError);
    await vi.advanceTimersByTimeAsync(0);
    await firstAssertion;

    const secondAnswers = fakeProvider.askDecisionQuestions(
      [searchQuestion],
      stepContext,
      requestOptions(),
    );
    await vi.advanceTimersByTimeAsync(0);
    await expect(secondAnswers).resolves.toHaveLength(1);
    expect(fakeProvider.recordedCalls.map((call) => call.callOutcome)).toEqual([
      "failed",
      "answered",
    ]);
  });

  it("stops and rejects when the abort signal fires", async () => {
    const abortController = new AbortController();
    const fakeProvider = createFakeDecisionProvider({ latencyInMilliseconds: 500 });

    const answers = fakeProvider.askDecisionQuestions(
      [searchQuestion],
      stepContext,
      requestOptions({ abortSignal: abortController.signal }),
    );
    const assertion = expect(answers).rejects.toBeInstanceOf(DecisionProviderError);
    await vi.advanceTimersByTimeAsync(100);
    abortController.abort();

    await assertion;
    expect(fakeProvider.recordedCalls[0]?.callOutcome).toBe("aborted");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects at once when the signal is already aborted", async () => {
    const abortController = new AbortController();
    abortController.abort();
    const fakeProvider = createFakeDecisionProvider();

    await expect(
      fakeProvider.askDecisionQuestions(
        [searchQuestion],
        stepContext,
        requestOptions({ abortSignal: abortController.signal }),
      ),
    ).rejects.toBeInstanceOf(DecisionProviderError);
    expect(fakeProvider.recordedCalls[0]?.callOutcome).toBe("aborted");
  });
});

describe("createFakeDecisionProvider: recorded calls", () => {
  it("records every call with its questions, context and request options", async () => {
    const fakeProvider = createFakeDecisionProvider();
    const options = requestOptions({ timeoutInMilliseconds: 250 });

    void fakeProvider.askDecisionQuestions([searchQuestion], stepContext, options);
    void fakeProvider.askDecisionQuestions([riskQuestion, choiceQuestion], stepContext, options);
    await vi.advanceTimersByTimeAsync(0);

    expect(fakeProvider.recordedCalls).toEqual([
      {
        callNumber: 1,
        decisionQuestions: [searchQuestion],
        stepContext,
        requestOptions: options,
        callOutcome: "answered",
      },
      {
        callNumber: 2,
        decisionQuestions: [riskQuestion, choiceQuestion],
        stepContext,
        requestOptions: options,
        callOutcome: "answered",
      },
    ]);

    fakeProvider.clearRecordedCalls();
    expect(fakeProvider.recordedCalls).toEqual([]);
  });

  it("keeps a copy of the question list, so later caller edits do not change the record", async () => {
    const fakeProvider = createFakeDecisionProvider();
    const decisionQuestions = [searchQuestion];

    void fakeProvider.askDecisionQuestions(decisionQuestions, stepContext, requestOptions());
    decisionQuestions.push(riskQuestion);

    expect(fakeProvider.recordedCalls[0]?.decisionQuestions).toEqual([searchQuestion]);
  });
});

describe("createFakeDecisionProvider inside the runtime (behavior rules)", () => {
  function createRuntime(fakeProvider: ReturnType<typeof createFakeDecisionProvider>) {
    return createKrinoRuntime(
      {
        projectName: "fake-provider-test",
        decisionModes: { toolSelection: "enforce" },
        explorationRate: 0,
        decisionProvider: fakeProvider,
        traceSink: { writeRecord: () => {}, flush: async () => {} },
      },
      { monotonicTime: () => Date.now(), warn: () => {} },
    );
  }
  const runStart = {
    hostName: "ai-sdk",
    hostSdkVersion: "7.0.0-test",
    capabilities: {
      supportedDecisions: ["toolSelection", "riskGate"],
      toolSelectionTiming: "perStep",
      reportsPerStepUsage: true,
    },
  } as const;

  it("a confident scripted answer narrows the tools in enforce mode", async () => {
    const fakeProvider = createFakeDecisionProvider({
      answerQuestion: (decisionQuestion) => ({
        choice: decisionQuestion.questionText.includes('"search"') ? "yes" : "no",
        probability: 0.99,
      }),
    });
    const runHandle = createRuntime(fakeProvider).startRun({
      ...runStart,
      capabilities: { ...runStart.capabilities, supportedDecisions: ["toolSelection"] },
    });

    const outcome = runHandle.decideToolSelection(stepContext);
    await vi.advanceTimersByTimeAsync(0);

    expect(await outcome).toMatchObject({
      toolNamesToSend: ["search"],
      decisionRecord: { decisionStatus: "answered", decisionModelVersion: "fake-decision-model-1" },
    });
  });

  it("the default conservative answers never remove a tool", async () => {
    const runHandle = createRuntime(createFakeDecisionProvider()).startRun({
      ...runStart,
      capabilities: { ...runStart.capabilities, supportedDecisions: ["toolSelection"] },
    });

    const outcome = runHandle.decideToolSelection(stepContext);
    await vi.advanceTimersByTimeAsync(0);

    expect((await outcome).toolNamesToSend).toEqual(["search", "sendEmail"]);
  });

  it("a simulated timeout sends all tools as timedOut and aborts the fake's call", async () => {
    const fakeProvider = createFakeDecisionProvider({ simulateTimeout: true });
    const runHandle = createRuntime(fakeProvider).startRun({
      ...runStart,
      capabilities: { ...runStart.capabilities, supportedDecisions: ["toolSelection"] },
    });

    const outcome = runHandle.decideToolSelection(stepContext);
    await vi.advanceTimersByTimeAsync(800);

    expect(await outcome).toMatchObject({
      toolNamesToSend: ["search", "sendEmail"],
      decisionRecord: { decisionStatus: "timedOut" },
    });
    expect(fakeProvider.recordedCalls[0]?.requestOptions.abortSignal.aborted).toBe(true);
    expect(fakeProvider.recordedCalls[0]?.callOutcome).toBe("aborted");
  });

  it("an injected error sends all tools as failed", async () => {
    const fakeProvider = createFakeDecisionProvider({
      injectError: () => new Error("injected outage"),
    });
    const runHandle = createRuntime(fakeProvider).startRun({
      ...runStart,
      capabilities: { ...runStart.capabilities, supportedDecisions: ["toolSelection"] },
    });

    const outcome = runHandle.decideToolSelection(stepContext);
    await vi.advanceTimersByTimeAsync(0);

    expect(await outcome).toMatchObject({
      toolNamesToSend: ["search", "sendEmail"],
      decisionRecord: { decisionStatus: "failed" },
    });
  });
});
