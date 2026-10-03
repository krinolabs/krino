import type { BenchMode } from "../environment/agent-environment.js";
import type { SdkVersions } from "../environment/installed-versions.js";
import type { BenchSetupName, RunSelection } from "../plan/run-plan.js";
import type { SetupReportResult } from "../report/report-engine.js";
import type { SetupGroupMetrics } from "../scoring/aggregate-metrics.js";

// The `krino-bench` output (the JSON file, and `--json`). Everything the blog chart needs.
// Fields are only added within one benchResultSchemaVersion. Documented in bench-runner/README.md.

export const BENCH_RESULT_SCHEMA_VERSION = 1 as const;

/** First line of every fake-mode text output, and `simulatedNotice` in the JSON. */
export const SIMULATED_NOTICE = "SIMULATED — not real measurements.";

export type ToolLoadingRecord = {
  hostName: "ai-sdk";
  /**
   * Whether an MCP server loaded every tool into the prompt. `null`: the AI SDK host passes tools
   * directly, with no MCP server.
   */
  mcpServerLoadedAllTools: boolean | null;
  /** Tools can be deferred behind tool search. Never on the AI SDK host. */
  deferredToolLoading: boolean;
  note: string;
};

export type CatalogSizeRecord = {
  /** All 100 bench tools (characters ÷ 4 of name, description and JSON Schema). */
  fullCatalogTokenCount: number;
  /** Per tool count; a subset's size depends on the task's required tools. */
  byToolCount: Array<{
    toolCount: number;
    minTokenCount: number;
    meanTokenCount: number;
    maxTokenCount: number;
  }>;
};

export type SpendRecord = {
  /** Before starting, from the price table; includes a safety margin. */
  estimatedInUsd: number;
  limitInUsd: number;
  /** Main model plus decisions, as the runtime priced them (simulated in fake mode). */
  spentInUsd: number;
  plannedRunCount: number;
  finishedRunCount: number;
  /** `"spendLimit"` when the guard stopped the bench before every planned run finished. */
  stopReason: "spendLimit" | null;
};

export type RunRecord = {
  runIndex: number;
  setupName: BenchSetupName;
  toolCount: number;
  taskIdentifier: string;
  repeatIndex: number;
  runStatus: "completed" | "failed";
  failureText: string | null;
  stepCount: number;
  /** Tools sent per step. */
  offeredToolCountByStep: Array<number>;
  calledToolNames: Array<string>;
  selectionRecall: boolean;
  stepZeroSelectionRecall: boolean;
  catalogTokenCount: number;
  agentCostInUsd: number;
  decisionCostInUsd: number;
};

/**
 * One row per setup and tool count: every number the blog chart plots, flat. Rates are 0..1;
 * `null` means nothing to measure (never 0).
 */
export type ChartRow = {
  setupName: BenchSetupName;
  toolCount: number;
  runCount: number;
  failedRunCount: number;
  /** Primary: recall at the step the tool was needed. */
  selectionRecall: number | null;
  stepZeroSelectionRecall: number | null;
  meanKeptShare: number | null;
  medianKeptShare: number | null;
  meanKeptCount: number | null;
  /** multiStep tasks only. */
  sequenceMatch: number | null;
  meanExtraCallCount: number | null;
  /** Main model, per step, cache reads and writes included. */
  costPerStepInUsd: number | null;
  meanUncachedInputTokensPerStep: number | null;
  meanCacheReadTokensPerStep: number | null;
  meanCacheWriteTokensPerStep: number | null;
  costPerRunInUsd: number | null;
  /** From the report engine (`krino report --json`); `null` when it could not be read. */
  cacheReadShare: number | null;
  multiStepCacheReadShare: number | null;
  stepLatencyP50InMilliseconds: number | null;
  stepLatencyP95InMilliseconds: number | null;
  decisionLatencyP50InMilliseconds: number | null;
  decisionLatencyP95InMilliseconds: number | null;
  /** Estimated by the runtime: tool selection and risk gate. */
  decisionCostPerRunInUsd: number | null;
  confidentSelectionShare: number | null;
  /**
   * Tool selections that timed out and failed open (all tools sent). High values mean the
   * decision timeout, not the router, decided the result. `null` when no selection was asked.
   */
  toolSelectionTimeoutShare: number | null;
  meanCatalogTokenCount: number | null;
};

const CHART_ROW_FIELD_FLAGS = {
  setupName: true,
  toolCount: true,
  runCount: true,
  failedRunCount: true,
  selectionRecall: true,
  stepZeroSelectionRecall: true,
  meanKeptShare: true,
  medianKeptShare: true,
  meanKeptCount: true,
  sequenceMatch: true,
  meanExtraCallCount: true,
  costPerStepInUsd: true,
  meanUncachedInputTokensPerStep: true,
  meanCacheReadTokensPerStep: true,
  meanCacheWriteTokensPerStep: true,
  costPerRunInUsd: true,
  cacheReadShare: true,
  multiStepCacheReadShare: true,
  stepLatencyP50InMilliseconds: true,
  stepLatencyP95InMilliseconds: true,
  decisionLatencyP50InMilliseconds: true,
  decisionLatencyP95InMilliseconds: true,
  decisionCostPerRunInUsd: true,
  confidentSelectionShare: true,
  toolSelectionTimeoutShare: true,
  meanCatalogTokenCount: true,
} satisfies Record<keyof ChartRow, true>;

/** Every `ChartRow` field name (the `satisfies` above keeps the list complete). */
export const CHART_ROW_FIELDS: ReadonlyArray<string> = Object.keys(CHART_ROW_FIELD_FLAGS);

export type SetupResult = SetupGroupMetrics & {
  /** Cache health of this setup's project, from `krino report --json`. */
  reportEngine: SetupReportResult;
};

export type BenchResult = {
  benchResultSchemaVersion: typeof BENCH_RESULT_SCHEMA_VERSION;
  mode: BenchMode;
  /** `SIMULATED_NOTICE` in fake mode, else `null`. */
  simulatedNotice: string | null;
  /** UTC date the bench started, YYYY-MM-DD. */
  runDate: string;
  /** ISO 8601. */
  startedAt: string;
  finishedAt: string;
  options: {
    setupNames: Array<BenchSetupName>;
    runSelection: RunSelection;
    toolCounts: Array<number>;
    maxSpendInUsd: number;
    /** krino's default (800) unless `--decision-timeout-ms` set it for a diagnostic run. */
    decisionTimeoutInMilliseconds: number;
  };
  models: {
    configuredAgentModelIdentifier: string;
    /** As the traces recorded them. */
    agentModelIdentifiers: Array<string>;
    decisionProviderName: string;
    /** As the decision records reported them. */
    decisionModelVersions: Array<string>;
  };
  sdkVersions: SdkVersions;
  toolLoading: ToolLoadingRecord;
  catalog: CatalogSizeRecord;
  spend: SpendRecord;
  traceDirectory: string;
  /** The comparison, flat, for the chart. */
  chartRows: Array<ChartRow>;
  setups: Array<SetupResult>;
  runs: Array<RunRecord>;
};

export const AI_SDK_TOOL_LOADING: ToolLoadingRecord = {
  hostName: "ai-sdk",
  mcpServerLoadedAllTools: null,
  deferredToolLoading: false,
  note:
    "The AI SDK host passes tools directly (no MCP server). Every tool sent on a step is in the " +
    "prompt; none is deferred.",
};
