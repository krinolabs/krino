import type {
  DecisionAnswer,
  DecisionProvider,
  DecisionQuestion,
  DecisionRequestOptions,
  StepContext,
} from "../../contracts/index.js";
import { DecisionProviderError, DecisionTimeoutError } from "../../contracts/index.js";

export const FAKE_PROVIDER_NAME = "fake";
export const FAKE_DECISION_MODEL_VERSION = "fake-decision-model-1";

/** What the fake answers for one question. */
export type FakeAnswer = {
  choice: string;
  /** 0..1 */
  probability: number;
};

/** Answers a question by code. Return `null` to fall through to the unscripted rule. */
export type FakeAnswerFunction = (
  decisionQuestion: DecisionQuestion,
  stepContext: StepContext,
) => FakeAnswer | null;

/**
 * What happens to a question no script answers.
 * - `answerConservatively`: tool selection says "yes" (keep the tool), the risk gate says "no"
 *   (not safe), a choice question picks its first option; always with probability 0.5.
 *   Neither answer can remove a tool or allow a risky call.
 * - `fail`: the whole call rejects with `DecisionProviderError`.
 */
export type UnscriptedQuestionRule = "answerConservatively" | "fail";

export type FakeCallOutcome = "pending" | "answered" | "failed" | "timedOut" | "aborted";

/** One call to `askDecisionQuestions`, recorded for assertions. */
export type FakeProviderCall = {
  /** 1 for the first call. */
  callNumber: number;
  decisionQuestions: Array<DecisionQuestion>;
  stepContext: StepContext;
  requestOptions: DecisionRequestOptions;
  /** Updated when the call settles. */
  callOutcome: FakeCallOutcome;
};

/** Returns the error to reject this call with, or `null` to answer normally. */
export type FakeErrorInjection = (fakeProviderCall: FakeProviderCall) => unknown;

export type FakeDecisionProviderOptions = {
  /** Default `"fake"`. */
  providerName?: string;
  /** Exact match on `questionText`. Checked first. */
  answersByQuestionText?: Readonly<Record<string, FakeAnswer>>;
  /** Checked when no exact match exists. */
  answerQuestion?: FakeAnswerFunction;
  /** Default `"answerConservatively"`. */
  unscriptedQuestionRule?: UnscriptedQuestionRule;
  /** Delay before answering. Default 0. Also reported as each answer's latency. */
  latencyInMilliseconds?: number;
  /** Never answers: rejects with `DecisionTimeoutError` at the request timeout, or on abort. */
  simulateTimeout?: boolean;
  /** Rejects matching calls with the returned error after the latency. */
  injectError?: FakeErrorInjection;
  /** Default `FAKE_DECISION_MODEL_VERSION`. */
  decisionModelVersion?: string;
};

export type FakeDecisionProvider = DecisionProvider & {
  readonly recordedCalls: ReadonlyArray<FakeProviderCall>;
  /** Forgets every recorded call. */
  clearRecordedCalls: () => void;
};

const UNSURE_PROBABILITY = 0.5;

function conservativeAnswer(decisionQuestion: DecisionQuestion): FakeAnswer {
  if (decisionQuestion.options !== null) {
    return { choice: decisionQuestion.options[0] ?? "", probability: UNSURE_PROBABILITY };
  }
  const choice = decisionQuestion.decisionKind === "toolSelection" ? "yes" : "no";
  return { choice, probability: UNSURE_PROBABILITY };
}

type ScriptedAnswers = Pick<
  FakeDecisionProviderOptions,
  "answersByQuestionText" | "answerQuestion" | "unscriptedQuestionRule"
>;

/** The answer for one question, or `null` when no script answers it and the rule is `fail`. */
export function findFakeAnswer(
  scriptedAnswers: ScriptedAnswers,
  decisionQuestion: DecisionQuestion,
  stepContext: StepContext,
): FakeAnswer | null {
  const exactAnswer = scriptedAnswers.answersByQuestionText?.[decisionQuestion.questionText];
  if (exactAnswer !== undefined) {
    return exactAnswer;
  }
  const computedAnswer = scriptedAnswers.answerQuestion?.(decisionQuestion, stepContext) ?? null;
  if (computedAnswer !== null) {
    return computedAnswer;
  }
  if (scriptedAnswers.unscriptedQuestionRule === "fail") {
    return null;
  }
  return conservativeAnswer(decisionQuestion);
}

/**
 * A scripted, offline `DecisionProvider` for tests, demos and the default config.
 * Honors `abortSignal` and `timeoutInMilliseconds` like a real provider.
 */
export function createFakeDecisionProvider(
  fakeOptions: FakeDecisionProviderOptions = {},
): FakeDecisionProvider {
  const providerName = fakeOptions.providerName ?? FAKE_PROVIDER_NAME;
  const decisionModelVersion = fakeOptions.decisionModelVersion ?? FAKE_DECISION_MODEL_VERSION;
  const latencyInMilliseconds = Math.max(0, fakeOptions.latencyInMilliseconds ?? 0);
  const recordedCalls: Array<FakeProviderCall> = [];
  let callCounter = 0;

  const answerCall = (fakeProviderCall: FakeProviderCall): Array<DecisionAnswer> => {
    return fakeProviderCall.decisionQuestions.map((decisionQuestion) => {
      const fakeAnswer = findFakeAnswer(
        fakeOptions,
        decisionQuestion,
        fakeProviderCall.stepContext,
      );
      if (fakeAnswer === null) {
        throw new DecisionProviderError(
          `fake provider has no scripted answer for: ${decisionQuestion.questionText}`,
          { providerName },
        );
      }
      return {
        choice: fakeAnswer.choice,
        probability: fakeAnswer.probability,
        decisionModelVersion,
        latencyInMilliseconds,
      };
    });
  };

  const askDecisionQuestions = (
    decisionQuestions: Array<DecisionQuestion>,
    stepContext: StepContext,
    requestOptions: DecisionRequestOptions,
  ): Promise<Array<DecisionAnswer>> => {
    callCounter += 1;
    const fakeProviderCall: FakeProviderCall = {
      callNumber: callCounter,
      decisionQuestions: [...decisionQuestions],
      stepContext,
      requestOptions,
      callOutcome: "pending",
    };
    recordedCalls.push(fakeProviderCall);

    return new Promise<Array<DecisionAnswer>>((resolveAnswers, rejectAnswers) => {
      const { abortSignal, timeoutInMilliseconds } = requestOptions;
      let answerHandle: ReturnType<typeof setTimeout> | undefined;
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

      const settle = (callOutcome: FakeCallOutcome): void => {
        fakeProviderCall.callOutcome = callOutcome;
        clearTimeout(answerHandle);
        clearTimeout(timeoutHandle);
        abortSignal.removeEventListener("abort", onAbort);
      };
      function onAbort(): void {
        settle("aborted");
        rejectAnswers(
          new DecisionProviderError("fake provider request was aborted", {
            providerName,
            cause: abortSignal.reason,
          }),
        );
      }

      if (abortSignal.aborted) {
        onAbort();
        return;
      }
      abortSignal.addEventListener("abort", onAbort);

      const willTimeOut =
        fakeOptions.simulateTimeout === true || latencyInMilliseconds > timeoutInMilliseconds;
      if (willTimeOut) {
        timeoutHandle = setTimeout(() => {
          settle("timedOut");
          rejectAnswers(new DecisionTimeoutError({ providerName, timeoutInMilliseconds }));
        }, timeoutInMilliseconds);
        return;
      }

      answerHandle = setTimeout(() => {
        const injectedError = fakeOptions.injectError?.(fakeProviderCall) ?? null;
        if (injectedError !== null) {
          settle("failed");
          rejectAnswers(injectedError);
          return;
        }
        try {
          const decisionAnswers = answerCall(fakeProviderCall);
          settle("answered");
          resolveAnswers(decisionAnswers);
        } catch (answerError) {
          settle("failed");
          rejectAnswers(answerError);
        }
      }, latencyInMilliseconds);
    });
  };

  return {
    providerName,
    askDecisionQuestions,
    recordedCalls,
    clearRecordedCalls: () => {
      recordedCalls.length = 0;
    },
  };
}
