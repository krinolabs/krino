import { costFromUsage, findModelPrice, type ModelPrice } from "@krinolabs/krino";
import type {
  AgreementRow,
  CacheUsageRow,
  DecisionStatusCountRow,
  RiskGateSuggestionRow,
  TraceAggregates,
} from "../trace-reader/read-trace-aggregates.js";
import { chooseNextStep } from "./next-step.js";
import {
  type AgreementMetric,
  type CacheHealthReport,
  type CacheShares,
  type CostSavedIfEnforced,
  type DecisionReport,
  type DecisionStatusCounts,
  type HostAgreement,
  type HostRiskGateSuggestions,
  type KrinoReport,
  REPORT_SCHEMA_VERSION,
} from "./report-types.js";

export type ReportContext = {
  projectName: string | null;
  since: Date;
  generatedAt: Date;
  traceDirectory: string;
  tokensPerToolDefinition: number;
  modelPrices: ReadonlyArray<ModelPrice>;
};

/** Hosts that report agreement per run in `RunSummaryTrace`; every other host is per step. */
const PER_RUN_AGREEMENT_HOSTS = new Set(["claude-agent-sdk"]);

const METRIC_LABELS: ReadonlyMap<AgreementMetric, string> = new Map([
  ["stepToolsInSuggestedSet", "steps whose called tools were all in the suggested set"],
  ["runToolsInSuggestedSet", "runs whose used tools were all in the suggested set"],
]);

const DECISION_KIND_ORDER = ["toolSelection", "riskGate"];
const DECISION_MODE_ORDER = ["off", "shadow", "enforce"];

const RISK_GATE_NOT_APPLICABLE =
  "The risk gate saves review time, not tokens, and runs in shadow mode only in v0.1.";
const UNKNOWN_KIND_NOT_APPLICABLE = "No saving estimate for this decision kind.";

function emptyStatusCounts(): DecisionStatusCounts {
  return {
    answered: 0,
    timedOut: 0,
    failed: 0,
    cutOff: 0,
    skippedUnsupported: 0,
    skippedExploration: 0,
  };
}

function addStatusCount(
  statusCounts: DecisionStatusCounts,
  decisionStatus: string,
  decisionCount: number,
): void {
  switch (decisionStatus) {
    case "answered":
    case "timedOut":
    case "failed":
    case "cutOff":
    case "skippedUnsupported":
    case "skippedExploration":
      statusCounts[decisionStatus] += decisionCount;
      return;
    default:
      // A status from a newer runtime: counted as a call, but not by name.
      return;
  }
}

function orderIndex(order: ReadonlyArray<string>, value: string): number {
  const index = order.indexOf(value);
  return index === -1 ? order.length : index;
}

function compareKindAndMode(
  left: { decisionKind: string; decisionMode: string },
  right: { decisionKind: string; decisionMode: string },
): number {
  return (
    orderIndex(DECISION_KIND_ORDER, left.decisionKind) -
      orderIndex(DECISION_KIND_ORDER, right.decisionKind) ||
    left.decisionKind.localeCompare(right.decisionKind) ||
    orderIndex(DECISION_MODE_ORDER, left.decisionMode) -
      orderIndex(DECISION_MODE_ORDER, right.decisionMode) ||
    left.decisionMode.localeCompare(right.decisionMode)
  );
}

// DuckDB sums in parallel, so the last bits of a float sum can differ between runs.
// Rounding keeps the JSON stable: USD to a billionth of a dollar, shares to a millionth.
const USD_DECIMALS = 1e9;
const SHARE_DECIMALS = 1e6;
const MILLISECOND_DECIMALS = 1e3;

export function roundUsd(amountInUsd: number): number {
  return Math.round(amountInUsd * USD_DECIMALS) / USD_DECIMALS;
}

function roundMilliseconds(milliseconds: number | null): number | null {
  return milliseconds === null
    ? null
    : Math.round(milliseconds * MILLISECOND_DECIMALS) / MILLISECOND_DECIMALS;
}

function ratio(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * SHARE_DECIMALS) / SHARE_DECIMALS : null;
}

export function agreementMetricForHost(hostName: string): AgreementMetric {
  return PER_RUN_AGREEMENT_HOSTS.has(hostName)
    ? "runToolsInSuggestedSet"
    : "stepToolsInSuggestedSet";
}

/** Each host gets the rows of its own metric only. */
export function hostAgreements(
  decisionMode: string,
  perStepAgreements: ReadonlyArray<AgreementRow>,
  perRunAgreements: ReadonlyArray<AgreementRow>,
): Array<HostAgreement> {
  const metricRows = [
    ...perStepAgreements.map((agreementRow) => ({
      agreementRow,
      metric: "stepToolsInSuggestedSet" as const,
    })),
    ...perRunAgreements.map((agreementRow) => ({
      agreementRow,
      metric: "runToolsInSuggestedSet" as const,
    })),
  ];
  return metricRows
    .filter(
      ({ agreementRow, metric }) =>
        agreementRow.decisionMode === decisionMode &&
        agreementMetricForHost(agreementRow.hostName) === metric,
    )
    .map(({ agreementRow, metric }) => ({
      hostName: agreementRow.hostName,
      metric,
      metricLabel: METRIC_LABELS.get(metric) ?? metric,
      agreeingCount: agreementRow.agreeingCount,
      comparedCount: agreementRow.comparedCount,
      agreementRate: ratio(agreementRow.agreeingCount, agreementRow.comparedCount),
    }))
    .sort((left, right) => left.hostName.localeCompare(right.hostName));
}

/** Risk-gate suggestion counts per host, for one mode. Unknown verdicts count as no suggestion. */
export function riskGateSuggestions(
  decisionMode: string,
  suggestionRows: ReadonlyArray<RiskGateSuggestionRow>,
): Array<HostRiskGateSuggestions> {
  const countsByHost = new Map<string, HostRiskGateSuggestions>();
  for (const suggestionRow of suggestionRows) {
    if (suggestionRow.decisionMode !== decisionMode) {
      continue;
    }
    const hostCounts = countsByHost.get(suggestionRow.hostName) ?? {
      hostName: suggestionRow.hostName,
      allow: 0,
      askHuman: 0,
      block: 0,
      noSuggestion: 0,
    };
    switch (suggestionRow.suggestedChoice) {
      case "allow":
      case "askHuman":
      case "block":
        hostCounts[suggestionRow.suggestedChoice] += suggestionRow.decisionCount;
        break;
      default:
        hostCounts.noSuggestion += suggestionRow.decisionCount;
    }
    countsByHost.set(suggestionRow.hostName, hostCounts);
  }
  return [...countsByHost.values()].sort((left, right) =>
    left.hostName.localeCompare(right.hostName),
  );
}

type PricedSaving = {
  costSavedIfEnforced: CostSavedIfEnforced;
  pricedModels: Array<ModelPrice>;
};

function toolSelectionSaving(
  decisionMode: string,
  decisionCostInUsd: number,
  traceAggregates: TraceAggregates,
  reportContext: ReportContext,
): PricedSaving {
  const { modelPrices } = reportContext;
  const suggestionRunCount = traceAggregates.suggestionRunCounts
    .filter((countRow) => countRow.decisionMode === decisionMode)
    .reduce((runTotal, countRow) => runTotal + countRow.runCount, 0);
  const savingRows = traceAggregates.removedToolTokens.filter(
    (tokenRow) => tokenRow.decisionMode === decisionMode,
  );
  const pricedModels: Array<ModelPrice> = [];
  const unpricedModelIdentifiers = new Set<string>();
  let grossSaving = 0;
  for (const savingRow of savingRows) {
    const modelPrice = findModelPrice(savingRow.modelIdentifier, modelPrices);
    if (modelPrice === null) {
      unpricedModelIdentifiers.add(savingRow.modelIdentifier);
      continue;
    }
    pricedModels.push(modelPrice);
    grossSaving += costFromUsage(
      {
        inputTokens: savingRow.removedUncachedTokens,
        outputTokens: 0,
        cacheReadTokens: savingRow.removedCacheReadTokens,
        cacheWriteTokens: savingRow.removedCacheWriteTokens,
      },
      modelPrice,
    );
  }
  const hasPrice = pricedModels.length > 0;
  const grossSavingInUsd = hasPrice || suggestionRunCount === 0 ? roundUsd(grossSaving) : null;
  return {
    costSavedIfEnforced: {
      estimateKind: "estimated",
      tokensPerToolDefinition: reportContext.tokensPerToolDefinition,
      grossSavingInUsd,
      decisionCostInUsd,
      netSavingInUsd:
        grossSavingInUsd === null ? null : roundUsd(grossSavingInUsd - decisionCostInUsd),
      suggestionRunCount,
      unpricedModelIdentifiers: [...unpricedModelIdentifiers].sort(),
    },
    pricedModels,
  };
}

function buildDecisionReports(
  traceAggregates: TraceAggregates,
  reportContext: ReportContext,
): { decisionReports: Array<DecisionReport>; pricedModels: Array<ModelPrice> } {
  const statusRowsByGroup = new Map<string, Array<DecisionStatusCountRow>>();
  for (const statusRow of traceAggregates.decisionStatusCounts) {
    const groupKey = JSON.stringify([statusRow.decisionKind, statusRow.decisionMode]);
    statusRowsByGroup.set(groupKey, [...(statusRowsByGroup.get(groupKey) ?? []), statusRow]);
  }

  const pricedModels: Array<ModelPrice> = [];
  const decisionReports: Array<DecisionReport> = [];
  for (const statusRows of statusRowsByGroup.values()) {
    const [firstRow] = statusRows;
    if (firstRow === undefined) {
      continue;
    }
    const { decisionKind, decisionMode } = firstRow;
    const statusCounts = emptyStatusCounts();
    let decisionCount = 0;
    let decisionCostInUsd = 0;
    for (const statusRow of statusRows) {
      addStatusCount(statusCounts, statusRow.decisionStatus, statusRow.decisionCount);
      decisionCount += statusRow.decisionCount;
      decisionCostInUsd += statusRow.decisionCostInUsd;
    }
    decisionCostInUsd = roundUsd(decisionCostInUsd);
    const latencyRow = traceAggregates.decisionLatencies.find(
      (candidate) =>
        candidate.decisionKind === decisionKind && candidate.decisionMode === decisionMode,
    );
    const isToolSelection = decisionKind === "toolSelection";
    const saving: PricedSaving = isToolSelection
      ? toolSelectionSaving(decisionMode, decisionCostInUsd, traceAggregates, reportContext)
      : {
          costSavedIfEnforced: {
            estimateKind: "notApplicable",
            reason:
              decisionKind === "riskGate" ? RISK_GATE_NOT_APPLICABLE : UNKNOWN_KIND_NOT_APPLICABLE,
          },
          pricedModels: [],
        };
    pricedModels.push(...saving.pricedModels);
    decisionReports.push({
      decisionKind,
      decisionMode,
      callCount: decisionCount - statusCounts.skippedUnsupported,
      statusCounts,
      agreementByHost: isToolSelection
        ? hostAgreements(
            decisionMode,
            traceAggregates.perStepAgreements,
            traceAggregates.perRunAgreements,
          )
        : [],
      suggestionsByHost:
        decisionKind === "riskGate"
          ? riskGateSuggestions(decisionMode, traceAggregates.riskGateSuggestions)
          : [],
      costSavedIfEnforced: saving.costSavedIfEnforced,
      decisionCostInUsd,
      addedLatencyInMilliseconds: {
        p50: roundMilliseconds(latencyRow?.addedLatencyP50 ?? null),
        p95: roundMilliseconds(latencyRow?.addedLatencyP95 ?? null),
      },
      decisionLatencyInMilliseconds: {
        p50: roundMilliseconds(latencyRow?.decisionLatencyP50 ?? null),
        p95: roundMilliseconds(latencyRow?.decisionLatencyP95 ?? null),
      },
    });
  }
  return { decisionReports: decisionReports.sort(compareKindAndMode), pricedModels };
}

export function cacheShares(
  usageRows: ReadonlyArray<
    Pick<CacheUsageRow, "uncachedTokens" | "cacheReadTokens" | "cacheWriteTokens">
  >,
): CacheShares {
  const uncachedTokens = usageRows.reduce((total, usageRow) => total + usageRow.uncachedTokens, 0);
  const cacheReadTokens = usageRows.reduce(
    (total, usageRow) => total + usageRow.cacheReadTokens,
    0,
  );
  const cacheWriteTokens = usageRows.reduce(
    (total, usageRow) => total + usageRow.cacheWriteTokens,
    0,
  );
  const totalInputTokens = uncachedTokens + cacheReadTokens + cacheWriteTokens;
  return {
    totalInputTokens,
    uncachedTokens,
    cacheReadTokens,
    cacheWriteTokens,
    cacheReadShare: ratio(cacheReadTokens, totalInputTokens),
    cacheWriteShare: ratio(cacheWriteTokens, totalInputTokens),
    uncachedShare: ratio(uncachedTokens, totalInputTokens),
  };
}

function buildCacheHealth(cacheUsage: ReadonlyArray<CacheUsageRow>): CacheHealthReport {
  return {
    overall: cacheShares(cacheUsage),
    byHost: [...cacheUsage]
      .sort((left, right) => left.hostName.localeCompare(right.hostName))
      .map((usageRow) => ({ hostName: usageRow.hostName, ...cacheShares([usageRow]) })),
  };
}

function uniqueModelPrices(
  pricedModels: ReadonlyArray<ModelPrice>,
): Array<{ modelIdentifier: string; verifiedOn: string }> {
  const verifiedOnByModel = new Map<string, string>();
  for (const modelPrice of pricedModels) {
    verifiedOnByModel.set(modelPrice.modelIdentifier, modelPrice.verifiedOn);
  }
  return [...verifiedOnByModel.entries()]
    .sort(([leftModel], [rightModel]) => leftModel.localeCompare(rightModel))
    .map(([modelIdentifier, verifiedOn]) => ({ modelIdentifier, verifiedOn }));
}

/** Turns the trace aggregates into the report. Pure. */
export function buildReport(
  traceAggregates: TraceAggregates,
  reportContext: ReportContext,
): KrinoReport {
  const { lineCounts } = traceAggregates;
  const { decisionReports, pricedModels } = buildDecisionReports(traceAggregates, reportContext);
  const callCount = decisionReports.reduce(
    (callTotal, decisionReport) => callTotal + decisionReport.callCount,
    0,
  );
  const cutOffCount = decisionReports.reduce(
    (cutOffTotal, decisionReport) => cutOffTotal + decisionReport.statusCounts.cutOff,
    0,
  );
  const reportWithoutNextStep: Omit<KrinoReport, "nextStep"> = {
    reportSchemaVersion: REPORT_SCHEMA_VERSION,
    generatedAt: reportContext.generatedAt.toISOString(),
    filters: {
      projectName: reportContext.projectName,
      since: reportContext.since.toISOString(),
      traceDirectory: reportContext.traceDirectory,
      traceFileCount: traceAggregates.traceFileCount,
    },
    lines: {
      readLineCount: lineCounts.readLineCount,
      validLineCount: lineCounts.validLineCount,
      skippedLineCount:
        lineCounts.invalidJsonLineCount +
        lineCounts.unsupportedSchemaVersionLineCount +
        lineCounts.invalidShapeLineCount,
      invalidJsonLineCount: lineCounts.invalidJsonLineCount,
      unsupportedSchemaVersionLineCount: lineCounts.unsupportedSchemaVersionLineCount,
      invalidShapeLineCount: lineCounts.invalidShapeLineCount,
    },
    records: { ...traceAggregates.recordCounts },
    decisions: decisionReports,
    cacheHealth: buildCacheHealth(traceAggregates.cacheUsage),
    cutOffs: { cutOffCount, callCount, cutOffShare: ratio(cutOffCount, callCount) },
    assumptions: {
      tokensPerToolDefinition: reportContext.tokensPerToolDefinition,
      modelPrices: uniqueModelPrices(pricedModels),
    },
  };
  return { ...reportWithoutNextStep, nextStep: chooseNextStep(reportWithoutNextStep) };
}
