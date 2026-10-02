import type { CreateKrino } from "./contracts/index.js";
import { createKrinoRuntime } from "./core/index.js";
import { createFakeDecisionProvider } from "./providers/fake/index.js";
import { createFileTraceSink } from "./sinks/file/index.js";

export * from "./contracts/index.js";
export { costFromUsage, encodeToolNameChoice } from "./core/index.js";
export { DEFAULT_MODEL_PRICES, findModelPrice } from "./pricing/index.js";
export {
  createFakeDecisionProvider,
  FAKE_DECISION_MODEL_VERSION,
  FAKE_PROVIDER_NAME,
  type FakeAnswer,
  type FakeAnswerFunction,
  type FakeCallOutcome,
  type FakeDecisionProvider,
  type FakeDecisionProviderOptions,
  type FakeErrorInjection,
  type FakeProviderCall,
  type UnscriptedQuestionRule,
} from "./providers/fake/index.js";
export { type RiskCosts, thresholdFromCosts } from "./risk-gate/index.js";
export {
  createFileTraceSink,
  type FileTraceSink,
  type FileTraceSinkOptions,
} from "./sinks/file/index.js";

/** Validates the config, applies defaults and returns the runtime. */
export const createKrino: CreateKrino = (krinoConfig) =>
  createKrinoRuntime(krinoConfig, {
    createDefaultTraceSink: () => createFileTraceSink({ projectName: krinoConfig.projectName }),
    createDefaultDecisionProvider: () => createFakeDecisionProvider(),
  });
