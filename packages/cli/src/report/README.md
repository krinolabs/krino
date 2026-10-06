# `krino report`

```
krino report [--project <name>] [--since 7d] [--trace-dir <folder>] [--tokens-per-tool 175] [--json]
```

- `--project`: report on one project. Default: every project.
- `--since`: a duration back from now (`12h`, `7d`, `2w`) or an ISO date or time
  (`2026-09-01`, `2026-09-01T08:00:00Z`). Default `7d`.
- `--trace-dir`: the folder with the trace files. Wins over `$KRINO_TRACE_DIRECTORY`.
- `--tokens-per-tool`: prompt tokens per tool definition, used for the estimated saving. Default
  `175`, an estimate, not a measurement.
- `--json`: print the report as JSON (shape below) instead of text.

Exit code: 0 on success, 1 on a bad `--since` or `--tokens-per-tool`, or when the trace files
cannot be read.

## Where it reads

The first that is set:

1. `--trace-dir` (relative folders resolve against the working directory);
2. `$KRINO_TRACE_DIRECTORY`;
3. the folder the file sink writes to by default: `$XDG_STATE_HOME/krino/traces/<project>`
   (only when `XDG_STATE_HOME` is absolute), else `~/.krino/traces/<project>`.

Records in a folder from 1 or 2 are still filtered by `--project`. Without `--project`, 3 reads
every project folder under `…/krino/traces`.
Only `traces-YYYY-MM-DD[.N].jsonl` files are read, and files from days before `--since` are
skipped. Node lists and reads the files; DuckDB gets their lines, never a path, because
DuckDB treats every path as a glob (a folder named `traces [old]` would match nothing).

## Bad lines

Every non-blank line is checked. A line is skipped and counted when it:

- is not valid JSON (`invalidJsonLineCount`);
- has no `traceSchemaVersion`, or one other than `1` (`unsupportedSchemaVersionLineCount`);
- is missing a field the report reads, or the field has the wrong type
  (`invalidShapeLineCount`).

## How the numbers are computed

- **Calls**: decisions that asked, or tried to ask, the provider: every status except
  `skippedUnsupported`.
- **Agreement**, per host, each with its own metric:
  - `stepToolsInSuggestedSet` (AI SDK, and any host without a run-level metric): steps whose
    called tools were all in the run's suggested set, over steps that called at least one tool.
  - `runToolsInSuggestedSet` (Claude Agent SDK): runs whose `toolSelectionAgreement` is `true`,
    over runs where it is not `null`.
  - The suggested set is the run's first tool-selection suggestion with status `answered` or
    `skippedExploration`. In enforce mode only exploration runs are compared, because enforced
    runs see only the suggested tools.
- **Risk-gate suggestions**, per host: how often the gate suggested `allow`, `askHuman` and
  `block`, plus `noSuggestion` (for example, cut off). v0.1 traces do not record the host's real
  permission outcome, so the risk gate has no agreement rate.
- **Cost saved if enforced** (tool selection only; an estimate): sending only the suggested
  tools removes `(available tools − suggested tools) × tokensPerToolDefinition` input tokens from
  every step of the run. Each step pays for those tokens at its own mix of uncached, cache-read
  and cache-write input, priced with the main model's price table row (cache multipliers
  included). Runs whose host reports usage per run only use the run summary: removed tokens ×
  `stepCount`, at the run's mix. The net saving subtracts what the decisions cost. Traces do not
  record tool-definition sizes, so `tokensPerToolDefinition` (175 by default; `--tokens-per-tool`
  changes it) is an assumption, shown in every report.
- **Added latency**: what the agent waited. Only enforce-mode tool selection is awaited in
  v0.1; shadow calls, exploration calls and every risk-gate call add 0 ms.
- **Decision latency**: how long the provider took (`latencyInMilliseconds`).
- **Cache health**: input tokens of each run (its run summary, else the sum of its steps), split
  into cache read, cache write and uncached. Shown twice, overall and per host: for all runs, and
  for multi-step runs only (`cacheHealth.multiStepRuns`). A run is multi-step when its summary's
  `stepCount` (else its number of step records) is above 1. A one-step run cannot read from the
  cache, so the multi-step share is the one to judge caching by; `krino doctor` warns on the same
  share, and a parity test checks that both compute the same numbers.
- **Cut-offs**: decisions with status `cutOff`, over all calls.
- **Next step**: the first rule that applies: no traces → no matching records → cut-off share
  above 5% → tool-selection agreement (at least 20 compared samples per host; 90% or more and a
  positive net saving suggests enforce on step 0) → cache read share of multi-step runs below
  50% → nothing to change.

## JSON shape (`reportSchemaVersion: 1`)

The TypeScript source of truth is [`report-types.ts`](./report-types.ts). Within one
`reportSchemaVersion`, fields are only added, never renamed or removed. Shares are `0..1`,
money is USD (rounded to 9 decimals), latency is milliseconds. `null` means "no data".

```jsonc
{
  "reportSchemaVersion": 1,
  "generatedAt": "2026-10-02T12:00:00.000Z",
  "filters": {
    "projectName": null,               // --project, or null for every project
    "since": "2026-09-25T12:00:00.000Z",
    "traceDirectory": "/home/me/.krino/traces",
    "traceFileCount": 3
  },
  "lines": {
    "readLineCount": 26,
    "validLineCount": 21,
    "skippedLineCount": 5,
    "invalidJsonLineCount": 1,
    "unsupportedSchemaVersionLineCount": 2,
    "invalidShapeLineCount": 2
  },
  "records": {
    "agentStepCount": 14,
    "runSummaryCount": 7,
    "runCount": 8,
    "projectNames": ["fixture-project"]
  },
  "decisions": [                       // sorted: toolSelection, riskGate; off, shadow, enforce
    {
      "decisionKind": "toolSelection",
      "decisionMode": "shadow",
      "callCount": 6,
      "statusCounts": {
        "answered": 4, "timedOut": 0, "failed": 1,
        "cutOff": 1, "skippedUnsupported": 0, "skippedExploration": 0
      },
      "agreementByHost": [
        {
          "hostName": "ai-sdk",
          "metric": "stepToolsInSuggestedSet",
          "metricLabel": "steps whose called tools were all in the suggested set",
          "agreeingCount": 3,
          "comparedCount": 4,
          "agreementRate": 0.75
        }
      ],
      "suggestionsByHost": [],        // risk gate only: [{ "hostName", "allow", "askHuman", "block", "noSuggestion" }]
      "costSavedIfEnforced": {
        "estimateKind": "estimated",   // or { "estimateKind": "notApplicable", "reason": "…" }
        "tokensPerToolDefinition": 175, // the assumption behind the estimate
        "grossSavingInUsd": 0.004257478,
        "decisionCostInUsd": 0.0013,
        "netSavingInUsd": 0.002957478,
        "suggestionRunCount": 4,
        "unpricedModelIdentifiers": []
      },
      "decisionCostInUsd": 0.0013,
      "addedLatencyInMilliseconds": { "p50": 0, "p95": 0 },
      "decisionLatencyInMilliseconds": { "p50": 260, "p95": 406 }
    }
  ],
  "cacheHealth": {
    "overall": {
      "totalInputTokens": 76200,
      "uncachedTokens": 7350,
      "cacheReadTokens": 42400,
      "cacheWriteTokens": 26450,
      "cacheReadShare": 0.55643,
      "cacheWriteShare": 0.347113,
      "uncachedShare": 0.096457
    },
    "byHost": [{ "hostName": "ai-sdk", "...": "same fields as overall" }],
    "multiStepRuns": {                 // added in reportSchemaVersion 1 (additive)
      "runCount": 6,                   // multi-step runs, counted once per host they used
      "overall": { "...": "same fields as cacheHealth.overall" },
      "byHost": [{ "hostName": "ai-sdk", "runCount": 3, "...": "same fields as overall" }]
    }
  },
  "cutOffs": { "cutOffCount": 2, "callCount": 12, "cutOffShare": 0.166667 },
  "nextStep": "17% of decisions were cut off: await finishRun (or flushAll) before the process exits.",
  "assumptions": {
    "tokensPerToolDefinition": 175,
    "modelPrices": [{ "modelIdentifier": "claude-haiku-4-5", "verifiedOn": "2026-10-02" }]
  }
}
```
