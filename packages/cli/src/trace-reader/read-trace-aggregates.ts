import { DOUBLE, type DuckDBConnection, DuckDBInstance, VARCHAR } from "@duckdb/node-api";
import {
  CACHE_USAGE_SQL,
  CLASSIFY_LINES_SQL,
  createTraceLinesSql,
  DECISION_LATENCY_SQL,
  DECISION_STATUS_COUNTS_SQL,
  DERIVED_TABLES_SQL,
  FILTERED_RECORDS_SQL,
  LINE_COUNTS_SQL,
  PER_RUN_AGREEMENT_SQL,
  PER_STEP_AGREEMENT_SQL,
  RECORD_COUNTS_SQL,
  REMOVED_TOOL_TOKENS_SQL,
  SUGGESTION_RUN_COUNTS_SQL,
} from "./trace-queries.js";

export type TraceReadFilters = {
  /** `null` reads every project. */
  projectName: string | null;
  /** Records with an earlier `recordedAt` are left out. */
  sinceEpochMilliseconds: number;
  /** Assumed prompt size of one tool definition; traces do not record it. */
  tokensPerToolDefinition: number;
};

export type LineCounts = {
  readLineCount: number;
  validLineCount: number;
  invalidJsonLineCount: number;
  unsupportedSchemaVersionLineCount: number;
  invalidShapeLineCount: number;
};

export type RecordCounts = {
  agentStepCount: number;
  runSummaryCount: number;
  runCount: number;
  projectNames: Array<string>;
};

export type DecisionStatusCountRow = {
  decisionKind: string;
  decisionMode: string;
  decisionStatus: string;
  decisionCount: number;
  decisionCostInUsd: number;
};

export type DecisionLatencyRow = {
  decisionKind: string;
  decisionMode: string;
  decisionLatencyP50: number | null;
  decisionLatencyP95: number | null;
  addedLatencyP50: number | null;
  addedLatencyP95: number | null;
};

export type AgreementRow = {
  hostName: string;
  decisionMode: string;
  agreeingCount: number;
  comparedCount: number;
};

export type RemovedToolTokensRow = {
  decisionMode: string;
  modelIdentifier: string;
  runCount: number;
  removedUncachedTokens: number;
  removedCacheReadTokens: number;
  removedCacheWriteTokens: number;
};

export type SuggestionRunCountRow = {
  decisionMode: string;
  runCount: number;
};

export type CacheUsageRow = {
  hostName: string;
  uncachedTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

/** Everything the report needs from the trace files, already aggregated. */
export type TraceAggregates = {
  traceFileCount: number;
  lineCounts: LineCounts;
  recordCounts: RecordCounts;
  decisionStatusCounts: Array<DecisionStatusCountRow>;
  decisionLatencies: Array<DecisionLatencyRow>;
  perStepAgreements: Array<AgreementRow>;
  perRunAgreements: Array<AgreementRow>;
  removedToolTokens: Array<RemovedToolTokensRow>;
  suggestionRunCounts: Array<SuggestionRunCountRow>;
  cacheUsage: Array<CacheUsageRow>;
};

type ResultRow = Record<string, unknown>;

export const EMPTY_TRACE_AGGREGATES: Readonly<TraceAggregates> = Object.freeze({
  traceFileCount: 0,
  lineCounts: {
    readLineCount: 0,
    validLineCount: 0,
    invalidJsonLineCount: 0,
    unsupportedSchemaVersionLineCount: 0,
    invalidShapeLineCount: 0,
  },
  recordCounts: { agentStepCount: 0, runSummaryCount: 0, runCount: 0, projectNames: [] },
  decisionStatusCounts: [],
  decisionLatencies: [],
  perStepAgreements: [],
  perRunAgreements: [],
  removedToolTokens: [],
  suggestionRunCounts: [],
  cacheUsage: [],
});

function readColumn(resultRow: ResultRow, columnName: string): unknown {
  return Object.hasOwn(resultRow, columnName) ? resultRow[columnName] : undefined;
}

function numberColumn(resultRow: ResultRow, columnName: string): number {
  const columnValue = readColumn(resultRow, columnName);
  return typeof columnValue === "number" && Number.isFinite(columnValue) ? columnValue : 0;
}

function nullableNumberColumn(resultRow: ResultRow, columnName: string): number | null {
  const columnValue = readColumn(resultRow, columnName);
  return typeof columnValue === "number" && Number.isFinite(columnValue) ? columnValue : null;
}

function stringColumn(resultRow: ResultRow, columnName: string): string {
  const columnValue = readColumn(resultRow, columnName);
  return typeof columnValue === "string" ? columnValue : "";
}

function stringListColumn(resultRow: ResultRow, columnName: string): Array<string> {
  const columnValue = readColumn(resultRow, columnName);
  return Array.isArray(columnValue)
    ? columnValue.filter((listItem): listItem is string => typeof listItem === "string")
    : [];
}

async function selectRows(
  connection: DuckDBConnection,
  selectSql: string,
  numberParameters?: Record<string, number>,
): Promise<Array<ResultRow>> {
  const resultReader =
    numberParameters === undefined
      ? await connection.runAndReadAll(selectSql)
      : await connection.runAndReadAll(
          selectSql,
          numberParameters,
          Object.fromEntries(
            Object.keys(numberParameters).map((parameterName) => [parameterName, DOUBLE]),
          ),
        );
  return resultReader.getRowObjectsJS();
}

function agreementRows(resultRows: ReadonlyArray<ResultRow>): Array<AgreementRow> {
  return resultRows.map((resultRow) => ({
    hostName: stringColumn(resultRow, "host_name"),
    decisionMode: stringColumn(resultRow, "decision_mode"),
    agreeingCount: numberColumn(resultRow, "agreeing_count"),
    comparedCount: numberColumn(resultRow, "compared_count"),
  }));
}

async function aggregateWithConnection(
  connection: DuckDBConnection,
  traceFilePaths: ReadonlyArray<string>,
  traceReadFilters: TraceReadFilters,
): Promise<TraceAggregates> {
  await connection.run(createTraceLinesSql(traceFilePaths));
  await connection.run(CLASSIFY_LINES_SQL);
  const [lineCountRow] = await selectRows(connection, LINE_COUNTS_SQL);
  await connection.run(
    FILTERED_RECORDS_SQL,
    {
      projectName: traceReadFilters.projectName,
      sinceEpochMilliseconds: traceReadFilters.sinceEpochMilliseconds,
    },
    { projectName: VARCHAR, sinceEpochMilliseconds: DOUBLE },
  );
  await connection.run(DERIVED_TABLES_SQL);
  const [recordCountRow] = await selectRows(connection, RECORD_COUNTS_SQL);

  const lineCounts: LineCounts =
    lineCountRow === undefined
      ? EMPTY_TRACE_AGGREGATES.lineCounts
      : {
          readLineCount: numberColumn(lineCountRow, "read_line_count"),
          validLineCount: numberColumn(lineCountRow, "valid_line_count"),
          invalidJsonLineCount: numberColumn(lineCountRow, "invalid_json_line_count"),
          unsupportedSchemaVersionLineCount: numberColumn(
            lineCountRow,
            "unsupported_schema_version_line_count",
          ),
          invalidShapeLineCount: numberColumn(lineCountRow, "invalid_shape_line_count"),
        };
  const recordCounts: RecordCounts =
    recordCountRow === undefined
      ? EMPTY_TRACE_AGGREGATES.recordCounts
      : {
          agentStepCount: numberColumn(recordCountRow, "agent_step_count"),
          runSummaryCount: numberColumn(recordCountRow, "run_summary_count"),
          runCount: numberColumn(recordCountRow, "run_count"),
          projectNames: stringListColumn(recordCountRow, "project_names"),
        };

  const decisionStatusCounts = (await selectRows(connection, DECISION_STATUS_COUNTS_SQL)).map(
    (resultRow) => ({
      decisionKind: stringColumn(resultRow, "decision_kind"),
      decisionMode: stringColumn(resultRow, "decision_mode"),
      decisionStatus: stringColumn(resultRow, "decision_status"),
      decisionCount: numberColumn(resultRow, "decision_count"),
      decisionCostInUsd: numberColumn(resultRow, "decision_cost_in_usd"),
    }),
  );
  const decisionLatencies = (await selectRows(connection, DECISION_LATENCY_SQL)).map(
    (resultRow) => ({
      decisionKind: stringColumn(resultRow, "decision_kind"),
      decisionMode: stringColumn(resultRow, "decision_mode"),
      decisionLatencyP50: nullableNumberColumn(resultRow, "decision_latency_p50"),
      decisionLatencyP95: nullableNumberColumn(resultRow, "decision_latency_p95"),
      addedLatencyP50: nullableNumberColumn(resultRow, "added_latency_p50"),
      addedLatencyP95: nullableNumberColumn(resultRow, "added_latency_p95"),
    }),
  );
  const removedToolTokens = (
    await selectRows(connection, REMOVED_TOOL_TOKENS_SQL, {
      tokensPerToolDefinition: traceReadFilters.tokensPerToolDefinition,
    })
  ).map((resultRow) => ({
    decisionMode: stringColumn(resultRow, "decision_mode"),
    modelIdentifier: stringColumn(resultRow, "model_identifier"),
    runCount: numberColumn(resultRow, "run_count"),
    removedUncachedTokens: numberColumn(resultRow, "removed_uncached_tokens"),
    removedCacheReadTokens: numberColumn(resultRow, "removed_cache_read_tokens"),
    removedCacheWriteTokens: numberColumn(resultRow, "removed_cache_write_tokens"),
  }));
  const suggestionRunCounts = (await selectRows(connection, SUGGESTION_RUN_COUNTS_SQL)).map(
    (resultRow) => ({
      decisionMode: stringColumn(resultRow, "decision_mode"),
      runCount: numberColumn(resultRow, "run_count"),
    }),
  );
  const cacheUsage = (await selectRows(connection, CACHE_USAGE_SQL)).map((resultRow) => ({
    hostName: stringColumn(resultRow, "host_name"),
    uncachedTokens: numberColumn(resultRow, "uncached_tokens"),
    cacheReadTokens: numberColumn(resultRow, "cache_read_tokens"),
    cacheWriteTokens: numberColumn(resultRow, "cache_write_tokens"),
  }));

  return {
    traceFileCount: traceFilePaths.length,
    lineCounts,
    recordCounts,
    decisionStatusCounts,
    decisionLatencies,
    perStepAgreements: agreementRows(await selectRows(connection, PER_STEP_AGREEMENT_SQL)),
    perRunAgreements: agreementRows(await selectRows(connection, PER_RUN_AGREEMENT_SQL)),
    removedToolTokens,
    suggestionRunCounts,
    cacheUsage,
  };
}

/**
 * Reads the trace files with an in-memory DuckDB and aggregates them. Bad lines are counted,
 * never thrown. Throws only when DuckDB itself fails (for example, a file cannot be read).
 */
export async function readTraceAggregates(
  traceFilePaths: ReadonlyArray<string>,
  traceReadFilters: TraceReadFilters,
): Promise<TraceAggregates> {
  if (traceFilePaths.length === 0) {
    return { ...EMPTY_TRACE_AGGREGATES };
  }
  const duckDbInstance = await DuckDBInstance.create(":memory:");
  try {
    const connection = await duckDbInstance.connect();
    try {
      return await aggregateWithConnection(connection, traceFilePaths, traceReadFilters);
    } finally {
      connection.closeSync();
    }
  } finally {
    duckDbInstance.closeSync();
  }
}
