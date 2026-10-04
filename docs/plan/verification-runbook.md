# Verification day runbook

The step-by-step version of [`live-verification.md`](./live-verification.md), plus the parts of
[`release-checklist.md`](./release-checklist.md) that need its results. Follow it top to bottom.
Do not skip ahead: step 1 decides whether the benchmark runs at all.

Every cost here is an **estimate**. Bench costs are the bench runner's own estimates (printed by
`krino-bench`, checked on 2026-10-04 with `--fake`, which prices the same way). The other costs
are worked out from `packages/krino/src/pricing/price-table.ts` (Claude Haiku 4.5: $1 input /
$5 output per million tokens, cache writes 1.25×, cache reads 0.1×; Jev: $0.042 input, $0
output per million, no cache discount). The Jev output price is still unconfirmed (step 2).

## Before you start (no spend)

1. Work from an up-to-date `main`, from the repository root, on Node 22 or later.
2. Build everything once: `pnpm turbo run build`.
3. Set spend limits on both keys before they touch a shell:
   - AI Gateway key: **$45** (planned total ≈ $37, below, plus a margin).
   - Anthropic key: **$5** (only the Agent SDK runs use it, ≈ $0.15 planned).
4. Export `AI_GATEWAY_API_KEY` and `ANTHROPIC_API_KEY` in the shell you run from. Never paste a
   key into a PR, an ADR, a comment or a screenshot.
5. **Know the guards.** Only the scripts in `packages/krino/scripts/` need `KRINO_LIVE=1`; without
   it they print `… skipped` and exit 0. The examples and `krino-bench` have no `KRINO_LIVE`
   guard: they are live by default and spend as soon as the key is in the environment. Without
   the key they stop with exit 1 and a clear message, and spend nothing.
6. Open a results branch, for example `verification-results`. Every file change below goes in
   one PR from it (the "results PR"). Raw console output goes in comments on the merged WP PRs
   named in each step.

## Order

### 0. E2E online (WP-14) · $0

```sh
E2E_ONLINE=1 pnpm turbo run test --filter=@krinolabs/e2e
```

- **Good:** `e2e: packed and installed (online)` in the log, then `Test Files 12 passed`. Passed
  on 2026-10-04 on the `docs-verification-runbook` branch (58 tests). Run it again on the day:
  the registry can change.
- **Paste:** the summary lines as a comment on PR #16 (WP-14). Tick release-checklist step 5.

### 1. ADR-018 billing check (WP-03) · < $0.01

```sh
KRINO_LIVE=1 KRINO_RECORD_FIXTURES=1 pnpm --filter @krinolabs/krino smoke:jev
```

Three AI Gateway requests on a ≈ 2,000-token shared context (3, 1 and 20 questions). Even if
billed per question, that is about 48,000 Jev input tokens.

- **Good:** section 1 prints latency, model version, usage and sanitized provider metadata;
  section 2 prints a table with two rows (1 and 20 questions) and a `verdict:` line; section 3
  prints `wrote fixture recorded-three-questions.json` and `…twenty-questions.json`.
- **Bad:** `smoke:jev skipped` (KRINO_LIVE is not `1`), `smoke:jev failed: …`, or a verdict that
  starts with `UNKNOWN` (check the AI Gateway dashboard by hand and treat it as unknown until you
  have the numbers).
- **Paste:**
  - The billing table and the verdict line into
    [ADR-018](../adr/ADR-018-tool-selection-question-shape.md), section "Result pending" (rename
    it "Result"), with the date. Set the status to Accepted (billed once per request) or
    Rejected (billed once per question).
  - The new fixtures in `packages/krino/src/providers/jev-ai-gateway/fixtures/`: read the diff
    before committing. They must hold no prompt, task or tool text, only the sanitized shape.
  - The cost per decision into `README.md`, `[VERIFY after ADR-018: cost per decision]` (in
    "Limitations"), with the tool count it was measured at and "source: ADR-018".
  - The full console output (no keys appear in it) as a comment on PR #5 (WP-03).
  - All of these go in the results PR. Release-checklist step 2.

> **DECISION POINT.** Read the verdict before anything else.
>
> - **Billed once per request:** continue with step 2.
> - **Billed once per question:** **stop.** Do not run steps 3 to 7 or the bench. Tool
>   selection as built asks one question per tool, so a decision at 100 tools would cost about
>   100 × 20,000 Jev tokens ≈ **$0.08** instead of ≈ $0.001 (estimate), and the bench spend
>   estimates (which assume once per request) would be about **$33 low per full bench run**.
>   Decide the tool-selection question shape first (ADR-018 lists the alternatives), change the
>   code in its own PR, and run this step again.
> - **Unknown:** stop until the dashboard gives you the numbers.

### 2. Prices (WP-03) · $0

Check every row of `packages/krino/src/pricing/price-table.ts` against the provider's price page
(Anthropic for the Claude rows; the Vercel AI Gateway model page for `typesafe-ai/jev`).

- **Good:** every price matches, including Jev's real output price (now `0`).
- **Paste:** fixed prices and today's date in each row's `verifiedOn`; remove the
  `VERIFY BEFORE RELEASE` comment. This is a code change: put it in the results PR with a
  changeset (report costs change). Release-checklist step 3.
- If a price changed, every cost in this runbook moves with it. Re-run any `--fake` bench
  command with `--max-spend-usd 0.01` to print the new estimate without spending.

### 3. Live AI SDK run (WP-06) · ≈ $0.02

```sh
KRINO_LIVE=1 pnpm --filter @krinolabs/krino live:ai-sdk
```

Haiku 4.5 through AI Gateway, a ≈ 6,000-token cached system prompt, six tools, at most 6 steps.

- **Good:** each step's usage, the sanitized provider metadata shape with cache token keys, then
  the `krino report` for the run with tool selection answered (not timed out).
- **Paste:** the provider metadata shape and the report as a comment on PR #11 (WP-06).

### 4. Live Agent SDK run (WP-07) · ≤ $0.10

```sh
pnpm turbo run build --filter=@krinolabs/bench --filter=@krinolabs/cli
KRINO_LIVE=1 node --experimental-strip-types packages/krino/scripts/live-claude-agent-sdk.ts
```

Haiku 4.5 through the Agent SDK, six bench MCP tools, at most 6 turns. The Agent SDK's own
system prompt size was not measured, so this one is a loose upper bound.

- **Good:** `tool call: …` lines, `run …: success`, the usage shapes (also saved next to the
  trace folder as `…-usage-shapes.json`), then the `krino report`.
- **Check:** `agentSdkResult.totalCostInUsd` matches the Anthropic console for that request.
  If it printed `ANTHROPIC_API_KEY is not set; the Agent SDK will use the Claude CLI login`,
  stop: the run billed the CLI login, not the key, and the console comparison is meaningless.
- **Paste:** the usage shapes file and the report as a comment on PR #10 (WP-07).

### 5. Live examples (WP-12) · ≈ $0.06

First confirm both model IDs are still served: `anthropic/claude-haiku-4.5` on AI Gateway and
`claude-haiku-4-5` on the Anthropic API (`LIVE_MODEL_IDENTIFIER` in each example's
`src/log-triage.ts`). A changed ID is a code change: stop and fix it in its own PR.

```sh
cd examples/ai-sdk-cli
pnpm start --trace-dir ./traces
pnpm exec krino report --trace-dir ./traces
cd ../claude-agent-sdk-cli
pnpm start --trace-dir ./traces
pnpm exec krino report --trace-dir ./traces
cd ../..
```

Each run offers 100 tools (≈ 18,700 tokens): one cache write and two cache reads ≈ $0.03 per run.

- **Good:** `Mode: live (…)` (not `fake` or `[simulated]`), an answer, the tools used, then a
  report whose tool-selection calls were answered.
- `traces/` is not gitignored: do not commit it.
- **Paste:** both outputs and reports as a comment on PR #13 (WP-12).

### 6. Hand-made trace (M3) · ≈ $0.30

Ten live runs of the AI SDK example into one folder (the source does not say which agent; this
runbook assumes the AI SDK example, 5 runs per task), then one report:

```sh
cd examples/ai-sdk-cli
pnpm start --task task-059 --trace-dir ./traces-m3    # 5 times
pnpm start --task task-052 --trace-dir ./traces-m3    # 5 times
pnpm exec krino report --trace-dir ./traces-m3
cd ../..
```

- **Good:** `Records: … 10 runs`, every run answered.
- **Paste:** the report screenshot in the results PR description (crop out any path that shows
  your user name if you prefer).

### 7. Benchmark (WP-10) · ≈ $36.46 (+ $0.42 if you need the diagnostic run)

Build once, then run from the repository root. Run the bench with `node bench-runner/dist/main.js`
(`pnpm --filter @krinolabs/bench-runner exec krino-bench` fails: pnpm does not link a package's
own bin). `bench-traces/` is gitignored.

```sh
pnpm turbo run build --filter=@krinolabs/bench-runner...
```

| Run | Command | Estimate |
|---|---|---|
| 7a. Pilot | `node bench-runner/dist/main.js --pilot --trace-dir ./bench-traces/pilot` | $1.26 |
| 7b. Full, run 1 | `node bench-runner/dist/main.js --trace-dir ./bench-traces/full-1` | $15.14 |
| 7c. Full, run 2 | `node bench-runner/dist/main.js --trace-dir ./bench-traces/full-2` | $15.14 |
| 7d. Scaling | `node bench-runner/dist/main.js --setups step-zero --tool-counts 10,25,50,100 --repeats 1 --trace-dir ./bench-traces/scaling` | $4.92 |
| Diagnostic, only if 7a times out | `node bench-runner/dist/main.js --pilot --setups step-zero --decision-timeout-ms 3000 --trace-dir ./bench-traces/diagnostic` | $0.42 |

The estimates assume every tool selection fails open (all tools on every step) and add a 1.5×
margin, so real spend should come in lower. Each is under the default `--max-spend-usd 20`, so
no run needs a higher limit. Do not raise it.

For every run:

- **Good:** the text output has the line `krino-bench · <date> · mode: live …`, has no
  `SIMULATED` line, and `Runs: N of N`. Exit code 0. The results JSON
  (`bench-results-<time>.json` in the trace folder) has `"mode": "live"` and
  `"spend": { …, "stopReason": null }`.
- **Check after 7a (gate for 7b):** in the `step-zero` row, the "timed out" column
  (`toolSelectionTimeoutShare`) is at most 10% (a proposed threshold; the bench README says
  only "high"), and `failedRunCount` is 0 or close to it. If the timeout share is higher, run the
  diagnostic row, never publish it as a main result, and decide the timeout before 7b.
- **Check after 7c:** the two runs' `chartRows` agree: the same story for cost per step and
  recall. If they disagree, do not publish either; investigate first.
- **Paste:**
  - `README.md`, `[BENCH: cost per step, step-zero vs baseline]`: `totalCostPerStepInUsd` for
    `step-zero` against `baseline` at 100 tools, from run 1's `chartRows`.
  - `README.md`, `[BENCH: selection recall, step-zero]`: `selectionRecall` for `step-zero` at
    100 tools.
  - With each number: the run date and the bench-runner version (`sdkVersions` in the JSON).
    Then search for `[BENCH:` and `[VERIFY`: none may be left. Release-checklist step 4.
  - All four text outputs as a comment on PR #15 (WP-10). Keep the results JSON files; attach
    the full-run ones to the results PR if the numbers are questioned.

### 8. Close out · $0

- `pnpm turbo run lint typecheck test build` on the results branch (the snippet check is part of
  it: release-checklist step 6). Open the results PR.
- Tick every box in `live-verification.md`, then continue with release-checklist step 7.

## Cost summary (estimates)

| Step | Estimate | Key |
|---|---|---|
| 0. E2E online | $0 | none |
| 1. smoke:jev | < $0.01 | AI Gateway |
| 2. Prices | $0 | none |
| 3. Live AI SDK run | ≈ $0.02 | AI Gateway |
| 4. Live Agent SDK run | ≤ $0.10 | both |
| 5. Examples | ≈ $0.06 | AI Gateway; Agent SDK example uses both |
| 6. M3, 10 runs | ≈ $0.30 | AI Gateway |
| 7. Bench (pilot, 2 full, scaling) | $36.46 | AI Gateway |
| **Planned total** | **≈ $37** | |
| Diagnostic bench run, if needed | $0.42 | AI Gateway |

Only the bench numbers come from the bench runner; the rest are rough worked estimates. If ADR-018
says "billed once per question", none of the numbers after step 1 hold.

## Stop conditions

Stop, write down what you saw, and decide before running anything else when:

1. **Billing:** the ADR-018 verdict is "once per question" or unknown (step 1).
2. **Spend:** any step costs more than twice its estimate; total spend passes $40; a key hits its
   limit; `krino-bench` exits 3 (stopped at its limit) or 4 (estimate over the limit). Never
   rerun with a higher `--max-spend-usd` to get past it.
3. **Smoke or live run failed:** `smoke:jev failed`, any live script or example exits non-zero,
   prints `skipped` when it should have run, or prints `fake`, `[simulated]` or `SIMULATED`.
4. **Timeouts:** the step-zero timeout share (`toolSelectionTimeoutShare`) is over 10% in the
   pilot, or any report shows most tool selections timed out. Those numbers measure the timeout,
   not pruning.
5. **Failed runs:** more than 10% of a bench run's runs failed (`failedRunCount`), for example
   from API errors or rate limits.
6. **Model gone:** a `LIVE_MODEL_IDENTIFIER` is no longer served.
7. **Unstable results:** the two full runs disagree.
8. **Leak:** a key, a prompt or task text appears in any output, fixture or trace you are about to
   paste or commit.

## Open items (not fixed here: code or outside `docs/plan/`)

- **No command checks the Agent SDK `PreToolUse` items.** Both live Agent SDK runs set
  `tools: []`, so no built-in tool (Read, Grep, Glob) is ever offered, and neither prints when
  `PreToolUse` fires relative to the assistant `tool_use` message. These two boxes need a small
  live script that enables those built-ins and logs both events in order.
- **`bench-runner/README.md` line 9** uses `pnpm --filter @krinolabs/bench-runner exec
  krino-bench`, which fails with `Command "krino-bench" not found`.
- **The bench spend estimate assumes once-per-request billing** (`spend-estimate.ts`: shared
  prefix once, 25 tokens per question). If ADR-018 says otherwise, update it before any bench run.
- **`live-claude-agent-sdk.ts` has no package script** (its messages say `live:claude-agent-sdk`,
  but only `smoke:jev` and `live:ai-sdk` exist), and its header suggests
  `--env-file=../krino/.env`, which works only when the clone's folder is named `krino`.
- **M3 is not defined** anywhere else in the plan. Step 6 assumes 10 AI SDK example runs.
