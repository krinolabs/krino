import type {
  DecisionAnswer,
  DecisionProvider,
  DecisionQuestion,
  StepContext,
} from "../contracts/index.js";

export type ProviderCallResult =
  | {
      resultKind: "answered";
      decisionAnswers: Array<DecisionAnswer>;
      latencyInMilliseconds: number;
    }
  | { resultKind: "timedOut"; latencyInMilliseconds: number }
  | { resultKind: "failed"; failureCause: unknown; latencyInMilliseconds: number };

export type ProviderCall = {
  decisionProvider: DecisionProvider;
  decisionQuestions: Array<DecisionQuestion>;
  stepContext: StepContext;
  timeoutInMilliseconds: number;
  /** Aborted on timeout, and by the caller when the decision is cut off. */
  abortController: AbortController;
  monotonicTime: () => number;
};

/**
 * Asks the provider with a timeout. Never rejects: a timeout or an error becomes a result,
 * so a background call can never throw into the host agent.
 */
export function askProviderWithTimeout(providerCall: ProviderCall): Promise<ProviderCallResult> {
  const { decisionProvider, abortController, monotonicTime, timeoutInMilliseconds } = providerCall;
  const startedAt = monotonicTime();
  const elapsed = (): number => Math.max(0, monotonicTime() - startedAt);

  return new Promise<ProviderCallResult>((resolveResult) => {
    let isFinished = false;
    const finish = (providerCallResult: ProviderCallResult): void => {
      if (isFinished) {
        return;
      }
      isFinished = true;
      clearTimeout(timeoutHandle);
      resolveResult(providerCallResult);
    };

    const timeoutHandle = setTimeout(() => {
      finish({ resultKind: "timedOut", latencyInMilliseconds: elapsed() });
      abortController.abort();
    }, timeoutInMilliseconds);

    let answerPromise: Promise<Array<DecisionAnswer>>;
    try {
      answerPromise = decisionProvider.askDecisionQuestions(
        providerCall.decisionQuestions,
        providerCall.stepContext,
        { timeoutInMilliseconds, abortSignal: abortController.signal },
      );
    } catch (failureCause) {
      finish({ resultKind: "failed", failureCause, latencyInMilliseconds: elapsed() });
      return;
    }

    Promise.resolve(answerPromise).then(
      (decisionAnswers) => {
        if (!Array.isArray(decisionAnswers)) {
          finish({
            resultKind: "failed",
            failureCause: new TypeError("provider did not return an array of answers"),
            latencyInMilliseconds: elapsed(),
          });
          return;
        }
        finish({ resultKind: "answered", decisionAnswers, latencyInMilliseconds: elapsed() });
      },
      (failureCause: unknown) => {
        finish({ resultKind: "failed", failureCause, latencyInMilliseconds: elapsed() });
      },
    );
  });
}
