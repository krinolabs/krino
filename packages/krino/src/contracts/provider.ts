import type { DecisionAnswer, DecisionQuestion } from "./decisions.js";
import type { StepContext } from "./host.js";

export type DecisionRequestOptions = {
  timeoutInMilliseconds: number;
  abortSignal: AbortSignal;
};

export type DecisionProvider = {
  providerName: string;
  askDecisionQuestions: (
    decisionQuestions: Array<DecisionQuestion>,
    stepContext: StepContext,
    requestOptions: DecisionRequestOptions,
  ) => Promise<Array<DecisionAnswer>>;
};
