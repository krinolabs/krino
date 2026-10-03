# @krinolabs/bench-runner (`krino-bench`)

Private workspace package (`"private": true`, never published). It runs krino's three-setup
benchmark on the bench catalog (`@krinolabs/bench`) and prints the comparison. The published
`@krinolabs/cli` does not depend on it; it has its own bin, run from the repo:

```sh
pnpm turbo run build --filter=@krinolabs/bench-runner...
pnpm --filter @krinolabs/bench-runner exec krino-bench --fake --pilot
```

## Setups

| Setup | What it does |
|---|---|
| `baseline` | No routing: every tool on every step. |
| `per-step` | Prunes the tool list before **every** step. Bench-only code (`src/setups/per-step-router.ts`), never exported by `@krinolabs/krino`: it shows the prompt-cache trap that krino avoids by choosing tools on step 0 only (ADR-006). |
| `step-zero` | krino enforce mode: tools chosen once at step 0, kept for the run (`explorationRate: 0`). |

Every run is the log-triage agent from `examples/ai-sdk-cli` (`@krinolabs/example-ai-sdk-cli/agent`:
system prompt, step limit, risk-gate policy by effect) on the Vercel AI SDK host. The tools are
`selectToolSubset` slices of the catalog (`--tool-counts`), the task's expected tools always
included. The risk gate runs in shadow mode in every setup.

- **Live** (default): `anthropic/claude-haiku-4.5` and the Jev decision provider, both through
  Vercel AI Gateway. Needs `AI_GATEWAY_API_KEY`.
- **`--fake`**: no key, no network. The AI SDK mock model calls the task's expected tools in
  order, but only tools it was sent on that step, and answers early when the next one is missing.
  Its usage follows Anthropic's prompt cache: a step that sends the same tool list as the step
  before reads the cache; a changed list writes it again. krino's fake provider answers like a good
  router (yes for the needed tools, probability 0.95); for `per-step` it is asked about the
  expected tools not yet called. Fake decisions are priced as Jev. **Fake output is simulated**: the
  JSON has `"mode": "fake"`, and the text starts with `SIMULATED — not real measurements.`

## Options

| Option | Default | |
|---|---|---|
| `--fake` | off | Offline mode (above). |
| `--pilot` | off | A fixed stratified sample: 10 runs per setup and tool count (4 easy, 3 lookAlike, 3 multiStep, evenly spaced by task id). Not with `--repeats`. |
| `--repeats N` | 2 | Whole cycles: every task runs N times per setup and tool count. |
| `--setups` | all three | Comma list. |
| `--tool-counts` | 100 | Comma list of 10, 25, 50, 100. |
| `--max-spend-usd` | 20 | The spend guard (below). |
| `--trace-dir` | `$KRINO_TRACE_DIRECTORY`, then `~/.krino/traces/krino-bench` | Resolved with `resolveTraceDirectory` from `@krinolabs/krino`. |
| `--out` | `<trace dir>/bench-results-<time>.json` | The results JSON; always written. |
| `--json` | off | Print the results JSON instead of the text comparison. |

Runs go one at a time: tool count, then repeat, then task (difficulties interleaved, by task id),
then the setups back to back, so a run stopped early still compares the setups on the same tasks.
Progress goes to stderr, one line per run.

## Scoring

As defined in [`bench/README.md`](../bench/README.md#scoring), per setup and tool count, overall,
per difficulty, and per stable task id:

- **Selection recall (primary):** every expected tool was offered on the step it was needed.
- **Step-0 recall (secondary):** every expected tool was in the step-0 set.
- **Set size:** mean and median kept share of the step-0 set, mean kept count.
- **Sequence match and extra calls:** multiStep tasks only.
- **Cost per step:** main model, with uncached, cache-read and cache-write tokens.
- **Cache read share, all runs and multi-step runs:** from krino's report engine (`krino report
  --json --project <setup project> --since <bench start>`), run from the workspace CLI.
- **Latency:** agent step p50/p95, decision p50/p95.
- **Decision cost (estimated by the runtime)** and the **share of selections where every answer was
  confident** (the weakest answer at or above `minimumConfidence`, 0.8).

Failed runs are counted, not scored. A rate with nothing to measure is `null`, never 0.

## Output

Every run writes:

- **Traces** in the trace folder, one project per setup and tool count:
  `krino-bench-<setup>-<count>-tools` (so `krino report --project …` reads one setup). `per-step`'s
  router runs are not agent runs and are not traced; their decisions are in the results.
- **The results JSON** (`--out`; printed with `--json`), `benchResultSchemaVersion: 1`. Fields are
  only added within a version. The shape is `BenchResult` in `src/result/bench-result.ts`:

| Field | Holds |
|---|---|
| `mode`, `simulatedNotice` | `"fake"` or `"live"`; the notice is `SIMULATED — not real measurements.` in fake mode, else `null`. |
| `runDate`, `startedAt`, `finishedAt` | UTC. |
| `models` | Configured agent model, the agent models and decision model versions the traces recorded, the decision provider. |
| `sdkVersions` | `ai`, `@krinolabs/krino`, `@krinolabs/bench`, `@krinolabs/bench-runner`, `@krinolabs/cli`, Node. |
| `toolLoading` | Whether an MCP server loaded every tool (`mcpServerLoadedAllTools`: `null` on the AI SDK host, which has no MCP server) and whether tools were deferred (never, here). |
| `catalog` | Token count of the full catalog and of each tool count's subsets (min, mean, max over tasks). |
| `spend` | Estimate, limit, spent, planned and finished runs, `stopReason`. |
| `chartRows` | **The blog chart:** one flat row per setup and tool count with every number above. |
| `setups` | Per setup and tool count: `overall`, `byDifficulty`, `byTask` (by task id), `reportEngine`. |
| `runs` | One record per run: task id, setup, tool count, repeat, status, tools sent per step, calls, both recalls, costs. |

The text output is the same comparison: one table per tool count, recall by difficulty, and recall
per task id. In fake mode its first line is `SIMULATED — not real measurements.`

## Spend guard

1. **Before starting**, every planned run is estimated: the expected path (one step per expected
   tool, then the answer), as if every tool-selection decision failed open (all tools on every
   step: step 0 writes the cache, later steps read it), priced with krino's price table including
   cache reads and writes, plus the decisions, times a 1.5 margin. If the total is over
   `--max-spend-usd`, nothing runs: the message shows the estimate and suggests `--pilot` (with its
   estimate) or a higher limit. Exit code 4.
2. **While running**, actual spend (main model plus decisions, as the runtime priced them) is
   added up after each run. Before a run, the bench stops when spend has reached the limit, or
   when the run's estimate would take it over. It prints and writes the results for the finished
   runs and exits 3. A run that costs more than its estimate can overshoot the limit by that one
   run, so set a spend limit on the API key as well.

Estimates at the time of writing: `--pilot` ≈ $1.26, the default bench (2 repeats, 3 setups, 100
tools) ≈ $15.14, the scaling check (`--setups step-zero --tool-counts 10,25,50,100 --repeats 1`)
≈ $4.92. Fake mode prices the same way, so the guard is testable offline.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Every planned run finished; results printed and written. |
| 1 | Failed: live mode without `AI_GATEWAY_API_KEY`, or an unexpected error. |
| 2 | Bad options; the usage is printed. |
| 3 | Stopped at the spend limit; partial results printed and written. |
| 4 | The estimate is over `--max-spend-usd`; nothing was run. |

A failed agent run (for example an API error) does not stop the bench: it is recorded with
`runStatus: "failed"`, counted in `failedRunCount`, and left out of the scores.
