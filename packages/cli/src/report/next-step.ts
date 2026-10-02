import type { DecisionReport, HostAgreement, KrinoReport } from "./report-types.js";

/** Agreement at or above this suggests trying enforce mode on step 0. */
export const AGREEMENT_FOR_ENFORCE = 0.9;
/** Fewer compared samples than this, per host, is not enough to judge agreement. */
export const MINIMUM_COMPARED_SAMPLES = 20;
/** ADR-012: revisit flush timeouts when more than 5% of decisions are cut off. */
export const CUT_OFF_SHARE_WARNING = 0.05;
/** Same bar as `krino doctor`: below this, prompt caching is probably off or broken. */
export const CACHE_READ_SHARE_WARNING = 0.5;

function percent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

function hostList(hostAgreements: ReadonlyArray<HostAgreement>): string {
  return hostAgreements.map((hostAgreement) => hostAgreement.hostName).join(" and ");
}

function toolSelectionStep(
  shadowReport: DecisionReport | undefined,
  enforceReport: DecisionReport | undefined,
): string | null {
  if (shadowReport === undefined) {
    return enforceReport === undefined
      ? null
      : "Tool selection runs in enforce mode: keep explorationRate above 0 so agreement stays measurable.";
  }
  const judgedHosts = shadowReport.agreementByHost.filter(
    (hostAgreement) => hostAgreement.comparedCount >= MINIMUM_COMPARED_SAMPLES,
  );
  if (judgedHosts.length === 0) {
    const mostCompared = Math.max(
      0,
      ...shadowReport.agreementByHost.map((hostAgreement) => hostAgreement.comparedCount),
    );
    return (
      `Keep tool selection in shadow mode: agreement needs at least ${MINIMUM_COMPARED_SAMPLES} ` +
      `compared samples per host (most so far: ${mostCompared}).`
    );
  }
  const lowHosts = judgedHosts.filter(
    (hostAgreement) => (hostAgreement.agreementRate ?? 0) < AGREEMENT_FOR_ENFORCE,
  );
  const [lowestHost] = [...lowHosts].sort(
    (left, right) => (left.agreementRate ?? 0) - (right.agreementRate ?? 0),
  );
  if (lowestHost !== undefined) {
    return (
      `Keep tool selection in shadow mode: agreement on ${lowestHost.hostName} is ` +
      `${percent(lowestHost.agreementRate ?? 0)}, below ${percent(AGREEMENT_FOR_ENFORCE)}.`
    );
  }
  const saving = shadowReport.costSavedIfEnforced;
  if (
    saving.estimateKind === "estimated" &&
    saving.netSavingInUsd !== null &&
    saving.netSavingInUsd <= 0
  ) {
    return (
      `Tool selection agrees ${percent(AGREEMENT_FOR_ENFORCE)}+ on ${hostList(judgedHosts)}, ` +
      "but the estimated net saving is not positive: stay in shadow mode."
    );
  }
  return (
    `Tool selection agrees ${percent(AGREEMENT_FOR_ENFORCE)}+ on ${hostList(judgedHosts)}: ` +
    'try enforce on step 0 (decisionModes.toolSelection: "enforce").'
  );
}

/** The one "next step" line. The first rule that applies wins. */
export function chooseNextStep(report: Omit<KrinoReport, "nextStep">): string {
  if (report.lines.readLineCount === 0) {
    return (
      `No traces found in ${report.filters.traceDirectory}. ` +
      "Run your agent with krino (shadow mode), then run `krino report` again."
    );
  }
  if (report.records.agentStepCount + report.records.runSummaryCount === 0) {
    return "No trace records match the filters: try a longer --since or check --project.";
  }
  const { cutOffShare } = report.cutOffs;
  if (cutOffShare !== null && cutOffShare > CUT_OFF_SHARE_WARNING) {
    return (
      `${percent(cutOffShare)} of decisions were cut off: await finishRun (or flushAll) ` +
      "before the process exits."
    );
  }
  const toolSelectionReports = report.decisions.filter(
    (decisionReport) => decisionReport.decisionKind === "toolSelection",
  );
  const toolSelectionAdvice = toolSelectionStep(
    toolSelectionReports.find((decisionReport) => decisionReport.decisionMode === "shadow"),
    toolSelectionReports.find((decisionReport) => decisionReport.decisionMode === "enforce"),
  );
  if (toolSelectionAdvice !== null) {
    return toolSelectionAdvice;
  }
  const { cacheReadShare } = report.cacheHealth.overall;
  if (cacheReadShare !== null && cacheReadShare < CACHE_READ_SHARE_WARNING) {
    return (
      `Only ${percent(cacheReadShare)} of input tokens were read from cache: ` +
      "check that prompt caching is on."
    );
  }
  return "Nothing to change: keep collecting traces.";
}
