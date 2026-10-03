// DuckDB SQL for the trace reader. Every line is parsed once by DuckDB's JSON reader; only small
// aggregate rows come back to JavaScript.
//
// DuckDB never gets a file path: its file readers treat every path as a glob, so a folder named
// `traces [old]` would silently match nothing. Node reads the listed files and appends their
// lines to `trace_lines`.

/** One row per non-blank line of every trace file. Filled with DuckDB's appender. */
export const TRACE_LINES_TABLE = "trace_lines";

export const CREATE_TRACE_LINES_SQL = `
CREATE TABLE ${TRACE_LINES_TABLE} (line_text VARCHAR)`;

// The order of `FIELD_TYPE_PATHS` fixes the indexes used in `CLASSIFY_LINES_SQL` (1-based).
const FIELD_TYPE_PATHS = [
  "$",
  "$.traceSchemaVersion",
  "$.recordType",
  "$.projectName",
  "$.runIdentifier",
  "$.hostName",
  "$.recordedAt",
  "$.modelIdentifier",
  "$.stepNumber",
  "$.availableToolNames",
  "$.chosenToolNames",
  "$.tokenUsage",
  "$.decisions",
  "$.totalTokenUsage",
  "$.stepCount",
  "$.usedToolNames",
  "$.toolSelectionAgreement",
];

const TOKEN_USAGE_STRUCTURE =
  '{"inputTokens":"DOUBLE","outputTokens":"DOUBLE","cacheReadTokens":"DOUBLE","cacheWriteTokens":"DOUBLE"}';

const DECISION_STRUCTURE =
  '{"decisionKind":"VARCHAR","decisionMode":"VARCHAR","decisionStatus":"VARCHAR",' +
  '"suggestedChoice":"VARCHAR","appliedChoice":"VARCHAR",' +
  '"latencyInMilliseconds":"DOUBLE","decisionCostInUsd":"DOUBLE"}';

/** Both record types in one structure; fields the other type lacks come back `NULL`. */
const TRACE_RECORD_STRUCTURE =
  '{"traceSchemaVersion":"VARCHAR","recordType":"VARCHAR","projectName":"VARCHAR",' +
  '"runIdentifier":"VARCHAR","hostName":"VARCHAR","recordedAt":"VARCHAR",' +
  '"modelIdentifier":"VARCHAR","stepNumber":"DOUBLE",' +
  '"availableToolNames":["VARCHAR"],"chosenToolNames":["VARCHAR"],' +
  `"tokenUsage":${TOKEN_USAGE_STRUCTURE},"decisions":[${DECISION_STRUCTURE}],` +
  `"totalTokenUsage":${TOKEN_USAGE_STRUCTURE},"stepCount":"DOUBLE",` +
  '"usedToolNames":["VARCHAR"],"toolSelectionAgreement":"BOOLEAN"}';

const NUMBER_TYPES = "('UBIGINT', 'BIGINT', 'DOUBLE')";

function tokenUsageIsComplete(fieldName: string): string {
  return `(record.${fieldName}.inputTokens IS NOT NULL
      AND record.${fieldName}.outputTokens IS NOT NULL
      AND record.${fieldName}.cacheReadTokens IS NOT NULL
      AND record.${fieldName}.cacheWriteTokens IS NOT NULL)`;
}

/**
 * Sorts each line into `invalidJson`, `unsupportedSchemaVersion`, `invalidShape` or `valid`.
 * A line is `valid` only when every field the report reads is present with the contract's type.
 */
export const CLASSIFY_LINES_SQL = `
CREATE TEMP VIEW parsed_lines AS
SELECT
  field_types IS NOT NULL AS is_json,
  field_types,
  CASE WHEN field_types IS NOT NULL
    THEN try(from_json(line_text, '${TRACE_RECORD_STRUCTURE}'))
  END AS record
FROM (
  -- \`json_type\` fails on invalid JSON; \`try\` turns that into NULL, so no separate validity pass.
  SELECT line_text,
    try(json_type(line_text, [${FIELD_TYPE_PATHS.map((fieldPath) => `'${fieldPath}'`).join(", ")}]))
      AS field_types
  FROM trace_lines
);

CREATE TEMP TABLE classified_lines AS
SELECT
  CASE
    WHEN NOT is_json THEN 'invalidJson'
    WHEN field_types[1] IS DISTINCT FROM 'OBJECT' THEN 'invalidShape'
    WHEN field_types[2] IS DISTINCT FROM 'UBIGINT'
      OR record.traceSchemaVersion IS DISTINCT FROM '1' THEN 'unsupportedSchemaVersion'
    WHEN record.recordType = 'agentStep'
      AND field_types[3] = 'VARCHAR' AND field_types[4] = 'VARCHAR'
      AND field_types[5] = 'VARCHAR' AND field_types[6] = 'VARCHAR'
      AND field_types[7] = 'VARCHAR' AND field_types[8] = 'VARCHAR'
      AND field_types[9] IN ${NUMBER_TYPES}
      AND field_types[10] = 'ARRAY' AND field_types[11] = 'ARRAY'
      AND (field_types[12] = 'NULL'
        OR (field_types[12] = 'OBJECT' AND ${tokenUsageIsComplete("tokenUsage")}))
      AND field_types[13] = 'ARRAY'
      AND coalesce(list_bool_and(list_transform(record.decisions, decision ->
        decision IS NOT NULL
        AND decision.decisionKind IS NOT NULL
        AND decision.decisionMode IS NOT NULL
        AND decision.decisionStatus IS NOT NULL)), true)
      AND try_cast(record.recordedAt AS TIMESTAMPTZ) IS NOT NULL
      THEN 'valid'
    WHEN record.recordType = 'runSummary'
      AND field_types[3] = 'VARCHAR' AND field_types[4] = 'VARCHAR'
      AND field_types[5] = 'VARCHAR' AND field_types[6] = 'VARCHAR'
      AND field_types[7] = 'VARCHAR' AND field_types[8] = 'VARCHAR'
      AND field_types[14] = 'OBJECT' AND ${tokenUsageIsComplete("totalTokenUsage")}
      AND field_types[15] IN ${NUMBER_TYPES}
      AND field_types[16] = 'ARRAY'
      AND field_types[17] IN ('BOOLEAN', 'NULL')
      AND try_cast(record.recordedAt AS TIMESTAMPTZ) IS NOT NULL
      THEN 'valid'
    ELSE 'invalidShape'
  END AS line_class,
  record
FROM parsed_lines;

DROP VIEW parsed_lines;
DROP TABLE trace_lines;`;

export const LINE_COUNTS_SQL = `
SELECT
  count(*)::DOUBLE AS read_line_count,
  count(*) FILTER (WHERE line_class = 'valid')::DOUBLE AS valid_line_count,
  count(*) FILTER (WHERE line_class = 'invalidJson')::DOUBLE AS invalid_json_line_count,
  count(*) FILTER (WHERE line_class = 'unsupportedSchemaVersion')::DOUBLE
    AS unsupported_schema_version_line_count,
  count(*) FILTER (WHERE line_class = 'invalidShape')::DOUBLE AS invalid_shape_line_count
FROM classified_lines`;

/**
 * Valid records inside the filters. Parameters: `$projectName` (NULL for every project) and
 * `$sinceEpochMilliseconds`. `DERIVED_TABLES_SQL` then splits them into steps, run summaries,
 * decisions and the tool-selection suggestion of each run.
 */
export const FILTERED_RECORDS_SQL = `
CREATE TEMP TABLE trace_records AS
SELECT record.*
FROM classified_lines
WHERE line_class = 'valid'
  AND ($projectName::VARCHAR IS NULL OR record.projectName = $projectName::VARCHAR)
  AND epoch_ms(CAST(record.recordedAt AS TIMESTAMPTZ)) >= $sinceEpochMilliseconds::DOUBLE`;

/** Tables derived from `trace_records`. */
export const DERIVED_TABLES_SQL = `
DROP TABLE classified_lines;

CREATE TEMP TABLE step_records AS
SELECT projectName, runIdentifier, stepNumber, hostName, modelIdentifier,
  availableToolNames, chosenToolNames, tokenUsage, decisions
FROM trace_records
WHERE recordType = 'agentStep';

CREATE TEMP TABLE run_summaries AS
SELECT projectName, runIdentifier, hostName, modelIdentifier, totalTokenUsage, stepCount,
  toolSelectionAgreement
FROM trace_records
WHERE recordType = 'runSummary';

CREATE TEMP TABLE decision_rows AS
SELECT projectName, runIdentifier, stepNumber, hostName,
  decision.decisionKind AS decisionKind,
  decision.decisionMode AS decisionMode,
  decision.decisionStatus AS decisionStatus,
  decision.suggestedChoice AS suggestedChoice,
  decision.latencyInMilliseconds AS latencyInMilliseconds,
  decision.decisionCostInUsd AS decisionCostInUsd
FROM (SELECT *, unnest(decisions) AS decision FROM step_records);

-- The first tool-selection suggestion of each run: what enforce mode sends (or would send).
CREATE TEMP TABLE run_suggestions AS
SELECT projectName, runIdentifier,
  arg_min(decisionMode, stepNumber) AS decisionMode,
  arg_min(decisionStatus, stepNumber) AS decisionStatus,
  min(stepNumber) AS decisionStepNumber,
  CASE WHEN arg_min(suggestedChoice, stepNumber) = '' THEN []::VARCHAR[]
    ELSE string_split(arg_min(suggestedChoice, stepNumber), ',') END AS suggestedToolNames
FROM decision_rows
WHERE decisionKind = 'toolSelection'
  AND suggestedChoice IS NOT NULL
  AND decisionStatus IN ('answered', 'skippedExploration')
GROUP BY projectName, runIdentifier;`;

export const RECORD_COUNTS_SQL = `
SELECT
  (SELECT count(*) FROM step_records)::DOUBLE AS agent_step_count,
  (SELECT count(*) FROM run_summaries)::DOUBLE AS run_summary_count,
  (SELECT count(*) FROM (SELECT DISTINCT projectName, runIdentifier FROM trace_records))::DOUBLE
    AS run_count,
  (SELECT coalesce(list(DISTINCT projectName ORDER BY projectName), []) FROM trace_records)
    AS project_names`;

export const DECISION_STATUS_COUNTS_SQL = `
SELECT decisionKind AS decision_kind, decisionMode AS decision_mode,
  decisionStatus AS decision_status,
  count(*)::DOUBLE AS decision_count,
  coalesce(sum(decisionCostInUsd), 0)::DOUBLE AS decision_cost_in_usd
FROM decision_rows
GROUP BY ALL
ORDER BY ALL`;

/**
 * Latency per decision kind and mode, over decisions that asked (or tried to ask) the provider.
 * Added latency is what the agent waited: only enforce-mode tool selection is awaited in v0.1;
 * shadow calls and every risk-gate call run in the background and add 0 ms.
 */
export const DECISION_LATENCY_SQL = `
SELECT decisionKind AS decision_kind, decisionMode AS decision_mode,
  quantile_cont(latencyInMilliseconds, 0.5)::DOUBLE AS decision_latency_p50,
  quantile_cont(latencyInMilliseconds, 0.95)::DOUBLE AS decision_latency_p95,
  quantile_cont(added_latency, 0.5)::DOUBLE AS added_latency_p50,
  quantile_cont(added_latency, 0.95)::DOUBLE AS added_latency_p95
FROM (
  SELECT *,
    CASE WHEN decisionKind = 'toolSelection' AND decisionMode = 'enforce'
        AND decisionStatus IN ('answered', 'timedOut', 'failed')
      THEN coalesce(latencyInMilliseconds, 0) ELSE 0 END AS added_latency
  FROM decision_rows
  WHERE decisionStatus <> 'skippedUnsupported'
)
GROUP BY ALL
ORDER BY ALL`;

/**
 * Enforce mode sends only the suggested tools, so agreement there is measured on exploration
 * runs (they send all tools). Shadow mode measures every run.
 */
const COMPARABLE_SUGGESTION = `(suggestion.decisionMode <> 'enforce'
  OR suggestion.decisionStatus = 'skippedExploration')`;

/** Per step: the tools a step called were all in the run's suggested set. */
export const PER_STEP_AGREEMENT_SQL = `
SELECT step.hostName AS host_name, suggestion.decisionMode AS decision_mode,
  count(*) FILTER (WHERE list_has_all(suggestion.suggestedToolNames, step.chosenToolNames))::DOUBLE
    AS agreeing_count,
  count(*)::DOUBLE AS compared_count
FROM step_records AS step
JOIN run_suggestions AS suggestion USING (projectName, runIdentifier)
WHERE len(step.chosenToolNames) > 0 AND ${COMPARABLE_SUGGESTION}
GROUP BY ALL
ORDER BY ALL`;

/** Per run: `RunSummaryTrace.toolSelectionAgreement`, written by the host adapter. */
export const PER_RUN_AGREEMENT_SQL = `
SELECT summary.hostName AS host_name, suggestion.decisionMode AS decision_mode,
  count(*) FILTER (WHERE summary.toolSelectionAgreement)::DOUBLE AS agreeing_count,
  count(*)::DOUBLE AS compared_count
FROM run_summaries AS summary
JOIN run_suggestions AS suggestion USING (projectName, runIdentifier)
WHERE summary.toolSelectionAgreement IS NOT NULL AND ${COMPARABLE_SUGGESTION}
GROUP BY ALL
ORDER BY ALL`;

/**
 * Input tokens that tool selection removes (or would remove) per run, split by how each step
 * paid for its input: uncached, cache read and cache write. Tool definitions sit in the cached
 * prompt prefix, so each removed token is priced at the step's own mix of the three.
 * Runs without per-step usage (Claude Agent SDK) use the run summary: removed tokens are sent on
 * every step of the run. Parameter: `$tokensPerToolDefinition`.
 */
export const REMOVED_TOOL_TOKENS_SQL = `
WITH run_removed_tokens AS (
  SELECT suggestion.projectName, suggestion.runIdentifier, suggestion.decisionMode,
    greatest(
      len(any_value(step.availableToolNames))
        - len(list_intersect(any_value(suggestion.suggestedToolNames),
          any_value(step.availableToolNames))),
      0) * $tokensPerToolDefinition::DOUBLE AS removed_tokens_per_step
  FROM run_suggestions AS suggestion
  JOIN step_records AS step
    ON step.projectName = suggestion.projectName
    AND step.runIdentifier = suggestion.runIdentifier
    AND step.stepNumber = suggestion.decisionStepNumber
  GROUP BY ALL
),
step_usage AS (
  SELECT projectName, runIdentifier, modelIdentifier,
    tokenUsage.inputTokens AS uncached_tokens,
    tokenUsage.cacheReadTokens AS cache_read_tokens,
    tokenUsage.cacheWriteTokens AS cache_write_tokens,
    tokenUsage.inputTokens + tokenUsage.cacheReadTokens + tokenUsage.cacheWriteTokens
      AS total_input_tokens,
    1 AS step_multiplier
  FROM step_records
  WHERE tokenUsage IS NOT NULL
),
summary_usage AS (
  SELECT summary.projectName, summary.runIdentifier, summary.modelIdentifier,
    summary.totalTokenUsage.inputTokens AS uncached_tokens,
    summary.totalTokenUsage.cacheReadTokens AS cache_read_tokens,
    summary.totalTokenUsage.cacheWriteTokens AS cache_write_tokens,
    summary.totalTokenUsage.inputTokens + summary.totalTokenUsage.cacheReadTokens
      + summary.totalTokenUsage.cacheWriteTokens AS total_input_tokens,
    greatest(summary.stepCount, 1) AS step_multiplier
  FROM run_summaries AS summary
  ANTI JOIN step_usage USING (projectName, runIdentifier)
),
priced_usage AS (
  SELECT * FROM step_usage
  UNION ALL
  SELECT * FROM summary_usage
)
SELECT removed.decisionMode AS decision_mode, usage.modelIdentifier AS model_identifier,
  count(DISTINCT (removed.projectName, removed.runIdentifier))::DOUBLE AS run_count,
  sum(least(removed.removed_tokens_per_step * usage.step_multiplier, usage.total_input_tokens)
    * usage.uncached_tokens / usage.total_input_tokens)::DOUBLE AS removed_uncached_tokens,
  sum(least(removed.removed_tokens_per_step * usage.step_multiplier, usage.total_input_tokens)
    * usage.cache_read_tokens / usage.total_input_tokens)::DOUBLE AS removed_cache_read_tokens,
  sum(least(removed.removed_tokens_per_step * usage.step_multiplier, usage.total_input_tokens)
    * usage.cache_write_tokens / usage.total_input_tokens)::DOUBLE AS removed_cache_write_tokens
FROM run_removed_tokens AS removed
JOIN priced_usage AS usage USING (projectName, runIdentifier)
WHERE usage.total_input_tokens > 0
GROUP BY ALL
ORDER BY ALL`;

/** Runs with a tool-selection suggestion, per mode, whether or not their usage can be priced. */
export const SUGGESTION_RUN_COUNTS_SQL = `
SELECT decisionMode AS decision_mode, count(*)::DOUBLE AS run_count
FROM run_suggestions
GROUP BY ALL
ORDER BY ALL`;

/**
 * Risk-gate suggestions per host and mode. v0.1 traces do not record what the host did with
 * the call, so the report shows what the gate suggested instead of an agreement rate.
 * `suggested_choice` is NULL when there was no suggestion (for example, a cut-off).
 */
export const RISK_GATE_SUGGESTION_COUNTS_SQL = `
SELECT hostName AS host_name, decisionMode AS decision_mode,
  suggestedChoice AS suggested_choice, count(*)::DOUBLE AS decision_count
FROM decision_rows
WHERE decisionKind = 'riskGate'
GROUP BY ALL
ORDER BY ALL`;

/**
 * Input tokens per host. Each run counts once: its summary, else the sum of its steps. The
 * `multi_step_*` columns repeat the sums over runs with more than one step (the summary's
 * `stepCount`, else the number of step records): one-step runs cannot read from the cache.
 * `krino doctor` computes the same rows in `commands/doctor-trace-scan.ts`; a parity test checks.
 */
export const CACHE_USAGE_SQL = `
WITH run_usage AS (
  SELECT projectName, runIdentifier, hostName,
    totalTokenUsage.inputTokens AS uncached_tokens,
    totalTokenUsage.cacheReadTokens AS cache_read_tokens,
    totalTokenUsage.cacheWriteTokens AS cache_write_tokens
  FROM run_summaries
  UNION ALL
  SELECT step.projectName, step.runIdentifier, step.hostName,
    step.tokenUsage.inputTokens,
    step.tokenUsage.cacheReadTokens,
    step.tokenUsage.cacheWriteTokens
  FROM step_records AS step
  ANTI JOIN run_summaries USING (projectName, runIdentifier)
  WHERE step.tokenUsage IS NOT NULL
),
run_step_counts AS (
  SELECT projectName, runIdentifier, max(stepCount) AS run_step_count
  FROM run_summaries
  GROUP BY ALL
  UNION ALL
  SELECT step.projectName, step.runIdentifier, count(*) AS run_step_count
  FROM step_records AS step
  ANTI JOIN run_summaries USING (projectName, runIdentifier)
  GROUP BY ALL
),
classified_usage AS (
  SELECT run_usage.*, run_step_count > 1 AS is_multi_step
  FROM run_usage
  JOIN run_step_counts USING (projectName, runIdentifier)
)
SELECT hostName AS host_name,
  sum(uncached_tokens)::DOUBLE AS uncached_tokens,
  sum(cache_read_tokens)::DOUBLE AS cache_read_tokens,
  sum(cache_write_tokens)::DOUBLE AS cache_write_tokens,
  count(DISTINCT [projectName, runIdentifier]) FILTER (WHERE is_multi_step)::DOUBLE
    AS multi_step_run_count,
  coalesce(sum(uncached_tokens) FILTER (WHERE is_multi_step), 0)::DOUBLE
    AS multi_step_uncached_tokens,
  coalesce(sum(cache_read_tokens) FILTER (WHERE is_multi_step), 0)::DOUBLE
    AS multi_step_cache_read_tokens,
  coalesce(sum(cache_write_tokens) FILTER (WHERE is_multi_step), 0)::DOUBLE
    AS multi_step_cache_write_tokens
FROM classified_usage
GROUP BY hostName
ORDER BY hostName`;
