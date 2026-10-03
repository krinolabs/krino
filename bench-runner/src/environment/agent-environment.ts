import type { BenchTask } from "@krinolabs/bench";
import {
  answerLikeAGoodProvider,
  FAKE_MODEL_IDENTIFIER,
  LIVE_MODEL_IDENTIFIER,
} from "@krinolabs/example-ai-sdk-cli/agent";
import {
  createFakeDecisionProvider,
  DEFAULT_MODEL_PRICES,
  type DecisionProvider,
  FAKE_DECISION_MODEL_VERSION,
  FAKE_PROVIDER_NAME,
  findModelPrice,
  type ModelPrice,
} from "@krinolabs/krino";
import { createJevAiGatewayProvider, JEV_MODEL_IDENTIFIER } from "@krinolabs/krino/providers/jev";
import { gateway, type LanguageModel } from "ai";
import { createFakeAgentModel } from "../fake/fake-agent-model.js";
import { matchExpectedSequence } from "../scoring/scoring.js";

// Where the agent model and the decisions come from. Live: the Haiku-class model and Jev, both
// through Vercel AI Gateway. Fake: the AI SDK mock model and krino's fake provider, offline.

export type BenchMode = "fake" | "live";

export type AgentEnvironment = {
  mode: BenchMode;
  /** The model the agent is configured with. The output also lists what the traces recorded. */
  agentModelIdentifier: string;
  decisionProviderName: string;
  /** The price-table row the spend estimate prices decisions with. */
  decisionPriceIdentifier: string;
  /** A new model for each run (the fake one keeps per-run cache state). */
  createModel: (task: BenchTask) => LanguageModel;
  /** Asked once per run, at step 0 (step-zero) or for the risk gate (every setup). */
  createDecisionProvider: (task: BenchTask) => DecisionProvider;
  /** per-step: asked before each step, given the tools the agent called so far. */
  createStepDecisionProvider: (
    task: BenchTask,
    calledToolNames: ReadonlyArray<string>,
  ) => DecisionProvider;
  priceOverrides: Array<ModelPrice>;
};

/** The fake provider's answers have the latency a fast decision model reports. */
const FAKE_DECISION_LATENCY_IN_MILLISECONDS = 20;

/** Prices the fake decision model as Jev, so fake output shows a decision cost. */
function fakeDecisionPrices(): Array<ModelPrice> {
  const jevPrice = findModelPrice(JEV_MODEL_IDENTIFIER, DEFAULT_MODEL_PRICES);
  return jevPrice === null ? [] : [{ ...jevPrice, modelIdentifier: FAKE_DECISION_MODEL_VERSION }];
}

export type FakeAgentEnvironmentOptions = {
  /** How long the fake provider takes to answer. Default 20 ms; tests raise it to force timeouts. */
  decisionLatencyInMilliseconds?: number;
};

export function createFakeAgentEnvironment(
  fakeOptions: FakeAgentEnvironmentOptions = {},
): AgentEnvironment {
  const fakeProvider = (neededToolNames: ReadonlyArray<string>): DecisionProvider =>
    createFakeDecisionProvider({
      answerQuestion: answerLikeAGoodProvider(neededToolNames),
      latencyInMilliseconds:
        fakeOptions.decisionLatencyInMilliseconds ?? FAKE_DECISION_LATENCY_IN_MILLISECONDS,
    });
  return {
    mode: "fake",
    agentModelIdentifier: FAKE_MODEL_IDENTIFIER,
    decisionProviderName: FAKE_PROVIDER_NAME,
    decisionPriceIdentifier: FAKE_DECISION_MODEL_VERSION,
    createModel: (task) => createFakeAgentModel(task.expectedToolNames),
    createDecisionProvider: (task) => fakeProvider(task.expectedToolNames),
    // The fake per-step router is DESIGNED TO VARY THE TOOL LIST: it keeps only the expected tools
    // the agent has not called yet, so the list changes on every step and the cache trap shows.
    // Its numbers illustrate the mechanism; they are not evidence about a real router.
    createStepDecisionProvider: (task, calledToolNames) => {
      const { matchedCount } = matchExpectedSequence(task.expectedToolNames, calledToolNames);
      return fakeProvider(task.expectedToolNames.slice(matchedCount));
    },
    priceOverrides: fakeDecisionPrices(),
  };
}

export function createLiveAgentEnvironment(): AgentEnvironment {
  const jevProvider = createJevAiGatewayProvider();
  return {
    mode: "live",
    agentModelIdentifier: LIVE_MODEL_IDENTIFIER,
    decisionProviderName: jevProvider.providerName,
    decisionPriceIdentifier: JEV_MODEL_IDENTIFIER,
    createModel: () => gateway(LIVE_MODEL_IDENTIFIER),
    createDecisionProvider: () => jevProvider,
    createStepDecisionProvider: () => jevProvider,
    priceOverrides: [],
  };
}
