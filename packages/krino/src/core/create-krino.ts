import type {
  CreateKrino,
  DecisionProvider,
  KrinoConfig,
  KrinoRuntime,
  ModelPrice,
  RunHandle,
  RunStartOptions,
  TraceSink,
} from "../contracts/index.js";
import {
  DEFAULT_CONTEXT_SAFETY_MARGIN_RATIO,
  DEFAULT_DECISION_CONTEXT_BUDGET_IN_TOKENS,
  DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS,
  DecisionProviderError,
} from "../contracts/index.js";
import { DEFAULT_MODEL_PRICES, mergeModelPrices } from "../pricing/index.js";
import type { ContextBudget } from "./context-budget.js";
import { flushTraceSinkSafely } from "./flush-trace-sink.js";
import { resolveKrinoConfig } from "./resolve-config.js";
import { createManagedRun, type ManagedRun } from "./run-handle.js";

/** Everything `createKrino` takes from its surroundings. Injectable for tests and for wiring. */
export type RuntimeDependencies = {
  currentTime: () => Date;
  monotonicTime: () => number;
  createRunIdentifier: () => string;
  /** How long `finishRun` waits for pending decisions and the sink. */
  flushTimeoutInMilliseconds: number;
  contextBudget: ContextBudget;
  modelPrices: ReadonlyArray<ModelPrice>;
  warn: (warningMessage: string) => void;
  /** Used when the config has no `decisionProvider`. */
  createDefaultDecisionProvider: () => DecisionProvider;
  /** Used when the config has no `traceSink`. */
  createDefaultTraceSink: () => TraceSink;
};

const UNCONFIGURED_PROVIDER_NAME = "unconfigured";

/**
 * Placeholder until the fake provider (WP-03) is wired in as the default.
 * Every question fails, so tool selection fails open and the risk gate fails closed.
 */
export function createUnconfiguredDecisionProvider(): DecisionProvider {
  return {
    providerName: UNCONFIGURED_PROVIDER_NAME,
    askDecisionQuestions: async () => {
      throw new DecisionProviderError("no decisionProvider is configured", {
        providerName: UNCONFIGURED_PROVIDER_NAME,
      });
    },
  };
}

/** Placeholder until the file sink (WP-04) is wired in as the default. Core does no file I/O. */
export function createDiscardingTraceSink(): TraceSink {
  return {
    writeRecord: () => {},
    flush: async () => {},
  };
}

export function defaultRuntimeDependencies(): RuntimeDependencies {
  return {
    currentTime: () => new Date(),
    monotonicTime: () => performance.now(),
    createRunIdentifier: () => crypto.randomUUID(),
    flushTimeoutInMilliseconds: DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS,
    contextBudget: {
      budgetInTokens: DEFAULT_DECISION_CONTEXT_BUDGET_IN_TOKENS,
      safetyMarginRatio: DEFAULT_CONTEXT_SAFETY_MARGIN_RATIO,
    },
    modelPrices: DEFAULT_MODEL_PRICES,
    warn: (warningMessage) => {
      console.warn(warningMessage);
    },
    createDefaultDecisionProvider: createUnconfiguredDecisionProvider,
    createDefaultTraceSink: createDiscardingTraceSink,
  };
}

/** `createKrino` with injectable dependencies. Throws `KrinoConfigurationError` on a bad config. */
export function createKrinoRuntime(
  krinoConfig: KrinoConfig,
  dependencyOverrides: Partial<RuntimeDependencies> = {},
): KrinoRuntime {
  const resolvedConfig = resolveKrinoConfig(krinoConfig);
  const dependencies: RuntimeDependencies = {
    ...defaultRuntimeDependencies(),
    ...dependencyOverrides,
  };

  let decisionProvider = resolvedConfig.decisionProvider;
  if (decisionProvider === null) {
    decisionProvider = dependencies.createDefaultDecisionProvider();
    dependencies.warn(
      `krino: no decisionProvider configured; using the "${decisionProvider.providerName}" provider`,
    );
  }
  let traceSink = resolvedConfig.traceSink;
  if (traceSink === null) {
    traceSink = dependencies.createDefaultTraceSink();
    dependencies.warn("krino: no traceSink configured; using the default trace sink");
  }
  const modelPrices = mergeModelPrices(dependencies.modelPrices, resolvedConfig.priceOverrides);
  const activeRuns = new Set<ManagedRun>();

  const startRun = (runStart: RunStartOptions): RunHandle => {
    const managedRun = createManagedRun({
      runIdentifier: dependencies.createRunIdentifier(),
      runStart,
      resolvedConfig,
      decisionProvider,
      traceSink,
      modelPrices,
      contextBudget: dependencies.contextBudget,
      flushTimeoutInMilliseconds: dependencies.flushTimeoutInMilliseconds,
      currentTime: dependencies.currentTime,
      monotonicTime: dependencies.monotonicTime,
      warn: dependencies.warn,
      onRunComplete: () => {
        activeRuns.delete(managedRun);
      },
    });
    activeRuns.add(managedRun);
    return managedRun.runHandle;
  };

  const flushAll = async (timeoutInMilliseconds: number): Promise<void> => {
    const deadline = dependencies.monotonicTime() + timeoutInMilliseconds;
    await Promise.all(
      [...activeRuns].map((managedRun) => managedRun.settlePendingDecisions(timeoutInMilliseconds)),
    );
    const remainingTimeout = Math.max(0, deadline - dependencies.monotonicTime());
    await flushTraceSinkSafely(traceSink, remainingTimeout, dependencies.warn);
  };

  return { startRun, flushAll };
}

/** Validates the config, applies defaults and returns the runtime. */
export const createKrino: CreateKrino = (krinoConfig) => createKrinoRuntime(krinoConfig);
