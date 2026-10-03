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
