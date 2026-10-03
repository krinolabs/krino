import { FAKE_DECISION_MODEL_VERSION, TRACE_SCHEMA_VERSION } from "@krinolabs/krino";
import type { CacheUsageRow, LineCounts } from "../trace-reader/read-trace-aggregates.js";

// A small in-process line scanner for `krino doctor`. It applies the same line rules as WP-09's
// DuckDB reader (`trace-queries.ts`, CLASSIFY_LINES_SQL), so doctor and `krino report` agree on
// which lines are bad; a parity test runs both on the same folders. Doctor needs fields the
// report's aggregates leave out (each run's `stepCount`, each decision's model version), and
// stays usable when DuckDB's native binding cannot load.
//
// Cache usage comes from the same sources as the report's CACHE_USAGE_SQL: a run's summaries
// when it has any, else that run's steps that carry token usage.

export type TraceLineClass = "invalidJson" | "unsupportedSchemaVersion" | "invalidShape";

type TokenUsageFields = {
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

type ScannedDecision = { decisionStatus: unknown; decisionModelVersion: unknown };

/** The fields doctor reads from a valid record. */
export type ScannedTraceRecord =
  | {
      recordType: "agentStep";
      projectName: string;
      runIdentifier: string;
      hostName: string;
      recordedAtEpochMilliseconds: number;
      /** `null` when the host reports usage per run only. */
      tokenUsage: TokenUsageFields | null;
      decisions: Array<ScannedDecision>;
    }
  | {
      recordType: "runSummary";
      projectName: string;
      runIdentifier: string;
      hostName: string;
      recordedAtEpochMilliseconds: number;
      stepCount: number;
      totalTokenUsage: TokenUsageFields;
    };

export type TraceLineResult =
  | { lineClass: "valid"; traceRecord: ScannedTraceRecord }
  | { lineClass: TraceLineClass };

export type TraceScanFilters = {
  /** `null` keeps every project. */
  projectName: string | null;
  /** Valid records with an earlier `recordedAt` are left out. Every line is still counted. */
  sinceEpochMilliseconds: number;
};

export type MultiStepRunUsage = {
  runCount: number;
  uncachedTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

export type TraceScanSummary = {
  lineCounts: LineCounts;
  agentStepCount: number;
  runSummaryCount: number;
  /** Distinct (project, run) pairs over every valid record. */
  runCount: number;
  decisionCount: number;
  cutOffDecisionCount: number;
  /** Decisions answered by the fake provider (`FAKE_DECISION_MODEL_VERSION`). */
  fakeProviderDecisionCount: number;
  /** Input token usage per host over every run, from the same sources as `krino report`. */
  cacheUsageByHost: Array<CacheUsageRow>;
  /**
   * The same sources, over runs with more than one step: the summary's `stepCount`, or the
   * number of step records for a run without a summary.
   */
  multiStepRunUsage: MultiStepRunUsage;
};

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Own field or `undefined`; never the prototype chain. */
function field(jsonObject: JsonObject, fieldName: string): unknown {
  return Object.hasOwn(jsonObject, fieldName) ? jsonObject[fieldName] : undefined;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function stringFields(jsonObject: JsonObject, fieldNames: ReadonlyArray<string>): boolean {
  return fieldNames.every((fieldName) => typeof field(jsonObject, fieldName) === "string");
}

function tokenUsageFrom(value: unknown): TokenUsageFields | null {
  if (!isJsonObject(value)) {
    return null;
  }
  const inputTokens = field(value, "inputTokens");
  const cacheReadTokens = field(value, "cacheReadTokens");
  const cacheWriteTokens = field(value, "cacheWriteTokens");
  return isNumber(inputTokens) &&
    isNumber(field(value, "outputTokens")) &&
    isNumber(cacheReadTokens) &&
    isNumber(cacheWriteTokens)
    ? { inputTokens, cacheReadTokens, cacheWriteTokens }
    : null;
}

function decisionsFrom(value: unknown): Array<ScannedDecision> | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const decisions: Array<ScannedDecision> = [];
  for (const decisionValue of value) {
    if (
      !isJsonObject(decisionValue) ||
      ["decisionKind", "decisionMode", "decisionStatus"].some(
        (fieldName) => field(decisionValue, fieldName) == null,
      )
    ) {
      return null;
    }
    decisions.push({
      decisionStatus: field(decisionValue, "decisionStatus"),
      decisionModelVersion: field(decisionValue, "decisionModelVersion"),
    });
  }
  return decisions;
}

const SHARED_STRING_FIELDS = [
  "projectName",
  "runIdentifier",
  "hostName",
  "recordedAt",
  "modelIdentifier",
];

function scanRecord(jsonObject: JsonObject): ScannedTraceRecord | null {
  if (!stringFields(jsonObject, SHARED_STRING_FIELDS)) {
    return null;
  }
  const projectName = String(field(jsonObject, "projectName"));
  const runIdentifier = String(field(jsonObject, "runIdentifier"));
  const hostName = String(field(jsonObject, "hostName"));
  const recordedAtEpochMilliseconds = Date.parse(String(field(jsonObject, "recordedAt")));
  if (Number.isNaN(recordedAtEpochMilliseconds)) {
    return null;
  }
  const recordType = field(jsonObject, "recordType");
  if (recordType === "agentStep") {
    const tokenUsageValue = field(jsonObject, "tokenUsage");
    const tokenUsage = tokenUsageFrom(tokenUsageValue);
    const decisions = decisionsFrom(field(jsonObject, "decisions"));
    const shapeIsValid =
      isNumber(field(jsonObject, "stepNumber")) &&
      Array.isArray(field(jsonObject, "availableToolNames")) &&
      Array.isArray(field(jsonObject, "chosenToolNames")) &&
      (tokenUsageValue === null || tokenUsage !== null);
    return shapeIsValid && decisions !== null
      ? {
          recordType,
          projectName,
          runIdentifier,
          hostName,
          recordedAtEpochMilliseconds,
          tokenUsage,
          decisions,
        }
      : null;
  }
  if (recordType === "runSummary") {
    const totalTokenUsage = tokenUsageFrom(field(jsonObject, "totalTokenUsage"));
    const stepCount = field(jsonObject, "stepCount");
    const agreement = field(jsonObject, "toolSelectionAgreement");
    const shapeIsValid =
      Array.isArray(field(jsonObject, "usedToolNames")) &&
      (typeof agreement === "boolean" || agreement === null);
    return shapeIsValid && totalTokenUsage !== null && isNumber(stepCount)
      ? {
          recordType,
          projectName,
          runIdentifier,
          hostName,
          recordedAtEpochMilliseconds,
          stepCount,
          totalTokenUsage,
        }
      : null;
  }
  return null;
}

/** Sorts one line like WP-09's reader: invalid JSON, unsupported schema version, bad shape, valid. */
export function classifyTraceLine(lineText: string): TraceLineResult {
  let lineValue: unknown;
  try {
    lineValue = JSON.parse(lineText);
  } catch {
    return { lineClass: "invalidJson" };
  }
  if (!isJsonObject(lineValue)) {
    return { lineClass: "invalidShape" };
  }
  if (field(lineValue, "traceSchemaVersion") !== TRACE_SCHEMA_VERSION) {
    return { lineClass: "unsupportedSchemaVersion" };
  }
  const traceRecord = scanRecord(lineValue);
  return traceRecord === null ? { lineClass: "invalidShape" } : { lineClass: "valid", traceRecord };
}

function countBadLine(lineCounts: LineCounts, lineClass: TraceLineClass): void {
  if (lineClass === "invalidJson") {
    lineCounts.invalidJsonLineCount += 1;
  } else if (lineClass === "unsupportedSchemaVersion") {
    lineCounts.unsupportedSchemaVersionLineCount += 1;
  } else {
    lineCounts.invalidShapeLineCount += 1;
  }
}

type UsageSource = { hostName: string; tokenUsage: TokenUsageFields };

/** One run's usage sources: its summaries, and those of its steps that carry usage. */
type RunUsageSources = {
  summaries: Array<UsageSource & { stepCount: number }>;
  stepRecordCount: number;
  steps: Array<UsageSource>;
};

type UsageTotals = Pick<CacheUsageRow, "uncachedTokens" | "cacheReadTokens" | "cacheWriteTokens">;

function addUsage(usageTotals: UsageTotals, tokenUsage: TokenUsageFields): void {
  usageTotals.uncachedTokens += tokenUsage.inputTokens;
  usageTotals.cacheReadTokens += tokenUsage.cacheReadTokens;
  usageTotals.cacheWriteTokens += tokenUsage.cacheWriteTokens;
}

/** The report's rule: a run's summaries when it has any, else its steps that carry usage. */
function sumCacheUsage(
  runUsageSources: Iterable<RunUsageSources>,
): Pick<TraceScanSummary, "cacheUsageByHost" | "multiStepRunUsage"> {
  const usageByHost = new Map<string, CacheUsageRow>();
  const multiStepRunUsage: MultiStepRunUsage = {
    runCount: 0,
    uncachedTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
  for (const runSources of runUsageSources) {
    const hasSummary = runSources.summaries.length > 0;
    const usageSources: Array<UsageSource> = hasSummary ? runSources.summaries : runSources.steps;
    if (usageSources.length === 0) {
      continue;
    }
    const runStepCount = hasSummary
      ? Math.max(...runSources.summaries.map((runSummary) => runSummary.stepCount))
      : runSources.stepRecordCount;
    const isMultiStep = runStepCount > 1;
    if (isMultiStep) {
      multiStepRunUsage.runCount += 1;
    }
    const multiStepHosts = new Set<CacheUsageRow>();
    for (const usageSource of usageSources) {
      let hostUsage = usageByHost.get(usageSource.hostName);
      if (hostUsage === undefined) {
        hostUsage = {
          hostName: usageSource.hostName,
          uncachedTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          multiStepRunCount: 0,
          multiStepUncachedTokens: 0,
          multiStepCacheReadTokens: 0,
          multiStepCacheWriteTokens: 0,
        };
        usageByHost.set(usageSource.hostName, hostUsage);
      }
      addUsage(hostUsage, usageSource.tokenUsage);
      if (isMultiStep) {
        addUsage(multiStepRunUsage, usageSource.tokenUsage);
        hostUsage.multiStepUncachedTokens += usageSource.tokenUsage.inputTokens;
        hostUsage.multiStepCacheReadTokens += usageSource.tokenUsage.cacheReadTokens;
        hostUsage.multiStepCacheWriteTokens += usageSource.tokenUsage.cacheWriteTokens;
        multiStepHosts.add(hostUsage);
      }
    }
    // Like the report: a multi-step run counts once per host it used.
    for (const hostUsage of multiStepHosts) {
      hostUsage.multiStepRunCount += 1;
    }
  }
  // Code-unit order, like the report's `ORDER BY ALL`.
  const cacheUsageByHost = [...usageByHost.values()].sort((left, right) =>
    left.hostName < right.hostName ? -1 : left.hostName > right.hostName ? 1 : 0,
  );
  return { cacheUsageByHost, multiStepRunUsage };
}

/** Counts and sums doctor needs, over the non-blank lines of the recent trace files. */
export function summarizeTraceLines(
  lineTexts: Iterable<string>,
  scanFilters: TraceScanFilters,
): TraceScanSummary {
  const lineCounts: LineCounts = {
    readLineCount: 0,
    validLineCount: 0,
    invalidJsonLineCount: 0,
    unsupportedSchemaVersionLineCount: 0,
    invalidShapeLineCount: 0,
  };
  const usageSourcesByRun = new Map<string, RunUsageSources>();
  const traceSummary: TraceScanSummary = {
    lineCounts,
    agentStepCount: 0,
    runSummaryCount: 0,
    runCount: 0,
    decisionCount: 0,
    cutOffDecisionCount: 0,
    fakeProviderDecisionCount: 0,
    cacheUsageByHost: [],
    multiStepRunUsage: { runCount: 0, uncachedTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
  };
  for (const lineText of lineTexts) {
    lineCounts.readLineCount += 1;
    const lineResult = classifyTraceLine(lineText);
    if (lineResult.lineClass !== "valid") {
      countBadLine(lineCounts, lineResult.lineClass);
      continue;
    }
    lineCounts.validLineCount += 1;
    const { traceRecord } = lineResult;
    if (
      (scanFilters.projectName !== null && traceRecord.projectName !== scanFilters.projectName) ||
      traceRecord.recordedAtEpochMilliseconds < scanFilters.sinceEpochMilliseconds
    ) {
      continue;
    }
    const runKey = JSON.stringify([traceRecord.projectName, traceRecord.runIdentifier]);
    let runSources = usageSourcesByRun.get(runKey);
    if (runSources === undefined) {
      runSources = { summaries: [], stepRecordCount: 0, steps: [] };
      usageSourcesByRun.set(runKey, runSources);
    }
    if (traceRecord.recordType === "agentStep") {
      traceSummary.agentStepCount += 1;
      runSources.stepRecordCount += 1;
      if (traceRecord.tokenUsage !== null) {
        runSources.steps.push({
          hostName: traceRecord.hostName,
          tokenUsage: traceRecord.tokenUsage,
        });
      }
      for (const scannedDecision of traceRecord.decisions) {
        traceSummary.decisionCount += 1;
        if (scannedDecision.decisionStatus === "cutOff") {
          traceSummary.cutOffDecisionCount += 1;
        }
        if (scannedDecision.decisionModelVersion === FAKE_DECISION_MODEL_VERSION) {
          traceSummary.fakeProviderDecisionCount += 1;
        }
      }
      continue;
    }
    traceSummary.runSummaryCount += 1;
    runSources.summaries.push({
      hostName: traceRecord.hostName,
      stepCount: traceRecord.stepCount,
      tokenUsage: traceRecord.totalTokenUsage,
    });
  }
  traceSummary.runCount = usageSourcesByRun.size;
  return { ...traceSummary, ...sumCacheUsage(usageSourcesByRun.values()) };
}
