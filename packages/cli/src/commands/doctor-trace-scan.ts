import { FAKE_DECISION_MODEL_VERSION, TRACE_SCHEMA_VERSION } from "@krinolabs/krino";
import type { LineCounts } from "../trace-reader/read-trace-aggregates.js";

// A small in-process line scanner for `krino doctor`. It applies the same line rules as WP-09's
// DuckDB reader (`trace-queries.ts`, CLASSIFY_LINES_SQL), so doctor and `krino report` agree on
// which lines are bad; a parity test runs both on the same folders. Doctor needs fields the
// report's aggregates leave out (each run's `stepCount`, each decision's model version), and
// stays usable when DuckDB's native binding cannot load.

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
      recordedAtEpochMilliseconds: number;
      decisions: Array<ScannedDecision>;
    }
  | {
      recordType: "runSummary";
      projectName: string;
      runIdentifier: string;
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
  /** Token usage of run summaries with `stepCount > 1`. */
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
  const recordedAtEpochMilliseconds = Date.parse(String(field(jsonObject, "recordedAt")));
  if (Number.isNaN(recordedAtEpochMilliseconds)) {
    return null;
  }
  const recordType = field(jsonObject, "recordType");
  if (recordType === "agentStep") {
    const tokenUsageValue = field(jsonObject, "tokenUsage");
    const decisions = decisionsFrom(field(jsonObject, "decisions"));
    const shapeIsValid =
      isNumber(field(jsonObject, "stepNumber")) &&
      Array.isArray(field(jsonObject, "availableToolNames")) &&
      Array.isArray(field(jsonObject, "chosenToolNames")) &&
      (tokenUsageValue === null || tokenUsageFrom(tokenUsageValue) !== null) &&
      decisions !== null;
    return shapeIsValid && decisions !== null
      ? { recordType, projectName, runIdentifier, recordedAtEpochMilliseconds, decisions }
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
  const runKeys = new Set<string>();
  const traceSummary: TraceScanSummary = {
    lineCounts,
    agentStepCount: 0,
    runSummaryCount: 0,
    runCount: 0,
    decisionCount: 0,
    cutOffDecisionCount: 0,
    fakeProviderDecisionCount: 0,
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
    runKeys.add(JSON.stringify([traceRecord.projectName, traceRecord.runIdentifier]));
    if (traceRecord.recordType === "agentStep") {
      traceSummary.agentStepCount += 1;
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
    if (traceRecord.stepCount > 1) {
      const usage = traceSummary.multiStepRunUsage;
      usage.runCount += 1;
      usage.uncachedTokens += traceRecord.totalTokenUsage.inputTokens;
      usage.cacheReadTokens += traceRecord.totalTokenUsage.cacheReadTokens;
      usage.cacheWriteTokens += traceRecord.totalTokenUsage.cacheWriteTokens;
    }
  }
  traceSummary.runCount = runKeys.size;
  return traceSummary;
}
