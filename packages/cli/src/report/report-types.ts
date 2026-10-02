/**
 * The `krino report --json` shape. Stable: fields are only added, never renamed or removed,
 * within one `reportSchemaVersion`. Documented in `./README.md`.
 */
export const REPORT_SCHEMA_VERSION = 1 as const;

export type KrinoReport = {
  reportSchemaVersion: typeof REPORT_SCHEMA_VERSION;
  /** ISO 8601. */
  generatedAt: string;
  filters: ReportFilters;
  lines: LineSummary;
  records: RecordSummary;
  /** One entry per decision kind and mode found in the traces. */
  decisions: Array<DecisionReport>;
  cacheHealth: CacheHealthReport;
  cutOffs: CutOffSummary;
  /** One sentence: what to do next. */
  nextStep: string;
  assumptions: ReportAssumptions;
};

export type ReportFilters = {
  /** `--project`; `null` when every project was read. */
  projectName: string | null;
  /** ISO 8601: records with an earlier `recordedAt` are left out. */
  since: string;
  /** The folder that was read. */
  traceDirectory: string;
  traceFileCount: number;
};

export type LineSummary = {
  /** Non-blank lines in the trace files that were read. */
  readLineCount: number;
  validLineCount: number;
  /** Lines left out: the sum of the three counts below. */
  skippedLineCount: number;
  invalidJsonLineCount: number;
  /** `traceSchemaVersion` missing or not `1`. */
  unsupportedSchemaVersionLineCount: number;
  /** A field the report reads is missing or has the wrong type. */
  invalidShapeLineCount: number;
};

export type RecordSummary = {
  /** Valid records inside the filters. */
  agentStepCount: number;
  runSummaryCount: number;
  runCount: number;
  projectNames: Array<string>;
};

export type DecisionStatusCounts = {
  answered: number;
  timedOut: number;
  failed: number;
  cutOff: number;
  skippedUnsupported: number;
  skippedExploration: number;
};

export type LatencySummary = {
  /** Milliseconds; `null` without data. */
  p50: number | null;
  p95: number | null;
};

export type DecisionReport = {
  decisionKind: string;
  decisionMode: string;
  /** Decisions that asked, or tried to ask, the provider: every status but `skippedUnsupported`. */
  callCount: number;
  statusCounts: DecisionStatusCounts;
  /**
   * Tool selection: one entry per host, each with its own metric. Empty for the risk gate and
   * when nothing could be compared.
   */
  agreementByHost: Array<HostAgreement>;
  /**
   * Risk gate: what the gate suggested, per host. v0.1 traces do not record the host's real
   * permission outcome, so there is no agreement rate. Empty for tool selection.
   */
  suggestionsByHost: Array<HostRiskGateSuggestions>;
  costSavedIfEnforced: CostSavedIfEnforced;
  /** What the decisions themselves cost (estimated by the runtime in v0.1). */
  decisionCostInUsd: number;
  /** What the agent waited. Shadow calls run in the background and add 0 ms. */
  addedLatencyInMilliseconds: LatencySummary;
  /** How long the provider took to answer. */
  decisionLatencyInMilliseconds: LatencySummary;
};

/**
 * - `stepToolsInSuggestedSet` (AI SDK and other per-step hosts): steps whose called tools were
 *   all in the run's suggested set, over steps that called at least one tool.
 * - `runToolsInSuggestedSet` (Claude Agent SDK): runs whose used tools were all in the
 *   suggested set (`RunSummaryTrace.toolSelectionAgreement`).
 * Enforce mode is measured on exploration runs only, because enforced runs see only the
 * suggested tools.
 */
export type AgreementMetric = "stepToolsInSuggestedSet" | "runToolsInSuggestedSet";

export type HostAgreement = {
  hostName: string;
  metric: AgreementMetric;
  /** Plain-language label of `metric`, shown next to the number. */
  metricLabel: string;
  agreeingCount: number;
  comparedCount: number;
  /** 0..1; `null` when `comparedCount` is 0. */
  agreementRate: number | null;
};

export type HostRiskGateSuggestions = {
  hostName: string;
  allow: number;
  askHuman: number;
  block: number;
  /** No suggestion (for example, cut off before the answer). */
  noSuggestion: number;
};

export type CostSavedIfEnforced =
  | {
      /** Always an estimate: traces do not record tool-definition sizes. */
      estimateKind: "estimated";
      /** The assumption behind the estimate (`--tokens-per-tool`, default 175). */
      tokensPerToolDefinition: number;
      /**
       * Main-model input cost removed by sending only the suggested tools on every step,
       * priced at each step's mix of uncached, cache-read and cache-write tokens.
       * `null` when no model in the traces has a price.
       */
      grossSavingInUsd: number | null;
      decisionCostInUsd: number;
      /** `grossSavingInUsd - decisionCostInUsd`; `null` when the gross saving is `null`. */
      netSavingInUsd: number | null;
      /** Runs with a suggestion to price. */
      suggestionRunCount: number;
      /** Main models without a price; their runs add nothing to the saving. */
      unpricedModelIdentifiers: Array<string>;
    }
  | {
      estimateKind: "notApplicable";
      reason: string;
    };

export type CacheShares = {
  /** Uncached + cache read + cache write input tokens. */
  totalInputTokens: number;
  uncachedTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** 0..1 shares of `totalInputTokens`; `null` when it is 0. */
  cacheReadShare: number | null;
  cacheWriteShare: number | null;
  uncachedShare: number | null;
};

export type CacheHealthReport = {
  overall: CacheShares;
  byHost: Array<CacheShares & { hostName: string }>;
};

export type CutOffSummary = {
  cutOffCount: number;
  callCount: number;
  /** 0..1; `null` when there were no calls. */
  cutOffShare: number | null;
};

export type ReportAssumptions = {
  /**
   * Traces do not record tool-definition sizes; the saving estimate assumes this many tokens
   * per tool (`--tokens-per-tool`, default 175, measured from the bench catalog).
   */
  tokensPerToolDefinition: number;
  /** The price table rows used, with the date each was checked. */
  modelPrices: Array<{ modelIdentifier: string; verifiedOn: string }>;
};
