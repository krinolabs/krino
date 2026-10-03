import type { TextStyle } from "../terminal/text-style.js";
import type {
  CacheShares,
  CostSavedIfEnforced,
  DecisionReport,
  DecisionStatusCounts,
  KrinoReport,
  LatencySummary,
} from "./report-types.js";

const LABEL_WIDTH = 19;
const HOST_LABEL_WIDTH = 18;

const DECISION_KIND_NAMES: ReadonlyMap<string, string> = new Map([
  ["toolSelection", "Tool selection"],
  ["riskGate", "Risk gate"],
]);

const STATUS_NAMES: ReadonlyArray<[keyof DecisionStatusCounts, string]> = [
  ["answered", "answered"],
  ["timedOut", "timed out"],
  ["failed", "failed"],
  ["cutOff", "cut off"],
  ["skippedExploration", "exploration"],
  ["skippedUnsupported", "unsupported"],
];

const integerFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function formatCount(count: number): string {
  return integerFormat.format(count);
}

function formatPercent(share: number | null): string {
  return share === null ? "n/a" : `${(share * 100).toFixed(1)}%`;
}

/** Four decimals below one dollar: single runs cost fractions of a cent. */
export function formatUsd(amountInUsd: number): string {
  const sign = amountInUsd < 0 ? "-" : "";
  const absoluteAmount = Math.abs(amountInUsd);
  return `${sign}$${absoluteAmount.toFixed(absoluteAmount < 1 ? 4 : 2)}`;
}

function formatMilliseconds(milliseconds: number | null): string {
  return milliseconds === null ? "n/a" : `${Math.round(milliseconds)} ms`;
}

function formatLatency(latencySummary: LatencySummary): string {
  return `p50 ${formatMilliseconds(latencySummary.p50)} · p95 ${formatMilliseconds(latencySummary.p95)}`;
}

function labeled(textStyle: TextStyle, label: string, value: string): string {
  return `  ${textStyle.dim(label.padEnd(LABEL_WIDTH))}${value}`;
}

function continuation(value: string): string {
  return `  ${" ".repeat(LABEL_WIDTH)}${value}`;
}

function statusBreakdown(statusCounts: DecisionStatusCounts): string {
  const nonZeroStatuses = STATUS_NAMES.filter(([statusKey]) => statusCounts[statusKey] > 0).map(
    ([statusKey, statusName]) => `${statusName} ${formatCount(statusCounts[statusKey])}`,
  );
  return nonZeroStatuses.length === 0 ? "" : ` (${nonZeroStatuses.join(", ")})`;
}

function savingText(costSavedIfEnforced: CostSavedIfEnforced): string {
  if (costSavedIfEnforced.estimateKind === "notApplicable") {
    return `n/a. ${costSavedIfEnforced.reason}`;
  }
  const { grossSavingInUsd, netSavingInUsd, decisionCostInUsd, suggestionRunCount } =
    costSavedIfEnforced;
  if (grossSavingInUsd === null || netSavingInUsd === null) {
    return `n/a: no priced main-model usage (decision cost ${formatUsd(decisionCostInUsd)})`;
  }
  const runWord = suggestionRunCount === 1 ? "run" : "runs";
  // The asterisk points at the footer, which states the tokens-per-tool assumption.
  return (
    `estimated* ${formatUsd(netSavingInUsd)} net (${formatUsd(grossSavingInUsd)} input incl. ` +
    `cache − ${formatUsd(decisionCostInUsd)} decisions, ${formatCount(suggestionRunCount)} ${runWord})`
  );
}

function decisionLines(textStyle: TextStyle, decisionReport: DecisionReport): Array<string> {
  const kindName =
    DECISION_KIND_NAMES.get(decisionReport.decisionKind) ?? decisionReport.decisionKind;
  const lines = [
    textStyle.bold(`${kindName} · ${decisionReport.decisionMode}`),
    labeled(
      textStyle,
      "Calls",
      `${formatCount(decisionReport.callCount)}${statusBreakdown(decisionReport.statusCounts)}`,
    ),
  ];

  if (decisionReport.decisionKind === "toolSelection") {
    const agreementTexts = decisionReport.agreementByHost.map(
      (hostAgreement) =>
        `${hostAgreement.hostName.padEnd(HOST_LABEL_WIDTH)}${formatPercent(hostAgreement.agreementRate)} ` +
        `(${formatCount(hostAgreement.agreeingCount)}/${formatCount(hostAgreement.comparedCount)} ` +
        `${hostAgreement.metricLabel})`,
    );
    if (decisionReport.decisionMode === "enforce" && agreementTexts.length > 0) {
      // Enforced runs only see the suggested tools; exploration runs are the fair comparison.
      agreementTexts.push("measured on exploration runs only");
    }
    const [firstAgreement, ...otherAgreements] = agreementTexts;
    lines.push(labeled(textStyle, "Agreement", firstAgreement ?? "n/a: nothing to compare yet"));
    lines.push(...otherAgreements.map(continuation));
  } else if (decisionReport.decisionKind === "riskGate") {
    // v0.1 traces do not record the host's permission outcome: show suggestions, not agreement.
    const suggestionTexts = decisionReport.suggestionsByHost.map(
      (hostSuggestions) =>
        `${hostSuggestions.hostName.padEnd(HOST_LABEL_WIDTH)}` +
        `allow ${formatCount(hostSuggestions.allow)} · ` +
        `askHuman ${formatCount(hostSuggestions.askHuman)} · ` +
        `block ${formatCount(hostSuggestions.block)}` +
        (hostSuggestions.noSuggestion > 0
          ? ` · none ${formatCount(hostSuggestions.noSuggestion)}`
          : ""),
    );
    const [firstSuggestion, ...otherSuggestions] = suggestionTexts;
    lines.push(labeled(textStyle, "Suggestions", firstSuggestion ?? "none recorded"));
    lines.push(...otherSuggestions.map(continuation));
  }

  lines.push(
    labeled(textStyle, "Saved if enforced", savingText(decisionReport.costSavedIfEnforced)),
  );
  if (decisionReport.costSavedIfEnforced.estimateKind === "notApplicable") {
    lines.push(labeled(textStyle, "Decision cost", formatUsd(decisionReport.decisionCostInUsd)));
  }
  lines.push(
    labeled(textStyle, "Added latency", formatLatency(decisionReport.addedLatencyInMilliseconds)),
    labeled(
      textStyle,
      "Decision latency",
      formatLatency(decisionReport.decisionLatencyInMilliseconds),
    ),
  );
  return lines;
}

function cacheText(cacheShares: CacheShares): string {
  return (
    `read ${formatPercent(cacheShares.cacheReadShare)} · ` +
    `written ${formatPercent(cacheShares.cacheWriteShare)} · ` +
    `uncached ${formatPercent(cacheShares.uncachedShare)} ` +
    `(${formatCount(cacheShares.totalInputTokens)} tokens)`
  );
}

function skippedText(report: KrinoReport): string {
  const { lines } = report;
  if (lines.skippedLineCount === 0) {
    return "0 skipped";
  }
  const reasons = [
    [lines.invalidJsonLineCount, "invalid JSON"],
    [lines.unsupportedSchemaVersionLineCount, "unsupported schema version"],
    [lines.invalidShapeLineCount, "invalid shape"],
  ] as const;
  const reasonTexts = reasons
    .filter(([lineCount]) => lineCount > 0)
    .map(([lineCount, reason]) => `${formatCount(lineCount)} ${reason}`);
  return `${formatCount(lines.skippedLineCount)} skipped (${reasonTexts.join(", ")})`;
}

/** The human-readable report. Pure; colors come from `textStyle`. */
export function renderReportText(report: KrinoReport, textStyle: TextStyle): string {
  const { filters, records, cutOffs } = report;
  const projectText =
    filters.projectName ??
    (records.projectNames.length === 0 ? "all" : `all (${records.projectNames.join(", ")})`);
  const fileWord = filters.traceFileCount === 1 ? "file" : "files";
  const lines = [
    textStyle.bold("krino report"),
    `Project: ${projectText} · since ${filters.since}`,
    `Traces: ${filters.traceDirectory} (${formatCount(filters.traceFileCount)} ${fileWord}) · ` +
      `${formatCount(report.lines.readLineCount)} lines read, ${skippedText(report)}`,
    `Records: ${formatCount(records.agentStepCount)} steps, ` +
      `${formatCount(records.runSummaryCount)} run summaries, ${formatCount(records.runCount)} runs`,
  ];

  for (const decisionReport of report.decisions) {
    lines.push("", ...decisionLines(textStyle, decisionReport));
  }

  const { multiStepRuns } = report.cacheHealth;
  const runWord = multiStepRuns.runCount === 1 ? "run" : "runs";
  lines.push("", textStyle.bold("Cache health (input tokens)"));
  lines.push("All runs");
  lines.push(labeled(textStyle, "all hosts", cacheText(report.cacheHealth.overall)));
  for (const hostShares of report.cacheHealth.byHost) {
    lines.push(labeled(textStyle, hostShares.hostName, cacheText(hostShares)));
  }
  lines.push(`Multi-step runs only (${formatCount(multiStepRuns.runCount)} ${runWord})`);
  lines.push(labeled(textStyle, "all hosts", cacheText(multiStepRuns.overall)));
  for (const hostShares of multiStepRuns.byHost) {
    lines.push(labeled(textStyle, hostShares.hostName, cacheText(hostShares)));
  }

  lines.push(
    "",
    `${textStyle.bold("Cut-offs")}: ${formatCount(cutOffs.cutOffCount)} of ` +
      `${formatCount(cutOffs.callCount)} calls (${formatPercent(cutOffs.cutOffShare)})`,
    "",
    `${textStyle.bold(textStyle.accent("Next step"))}: ${report.nextStep}`,
  );
  const hasEstimate = report.decisions.some(
    (decisionReport) => decisionReport.costSavedIfEnforced.estimateKind === "estimated",
  );
  if (hasEstimate) {
    const priceDates = report.assumptions.modelPrices
      .map((modelPrice) => `${modelPrice.modelIdentifier} ${modelPrice.verifiedOn}`)
      .join(", ");
    lines.push(
      "",
      textStyle.dim(
        `* Estimated savings assume ${report.assumptions.tokensPerToolDefinition} tokens per tool ` +
          "definition (--tokens-per-tool); traces do not record tool-definition sizes." +
          (priceDates === "" ? "" : ` Prices verified on: ${priceDates}.`),
      ),
    );
  }
  return `${lines.join("\n")}\n`;
}
