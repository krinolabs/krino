# WP-26 · Benchmark on Pi (tool selection + model routing)

> **Branch:** `wp-26-bench-on-pi`  |  **Status:** ☐ not started
> **Read first:** [`AGENTS.md`](../../../AGENTS.md), [`03-contracts.md`](../shared/03-contracts.md), [`04-behavior-rules.md`](../shared/04-behavior-rules.md), [the v0.2 plan](./pi-host-and-model-routing.md), [WP-10](./wp-10-krino-bench.md), [`bench-runner/README.md`](../../../bench-runner/README.md)
> **Before you open a PR:** [`05-review-checklist.md`](../shared/05-review-checklist.md)

- **Owner role:** Claude Code.
- **Depends on:** [WP-20](./wp-20-pi-adapter.md), [WP-21](./wp-21-ai-sdk-model-routing.md),
  [WP-23](./wp-23-report-pi-model-routing.md), [WP-25](./wp-25-pi-example.md) (agent setup).
- **Owns:** `bench/src/hosts/pi.ts` and `bench/src/hosts/pi.test.ts`; Pi entries in
  `bench/package.json`; `bench-runner/src/**`, `bench-runner/package.json`,
  `bench-runner/README.md`.
- **Deliverables:**
  - **Pi host for the catalog** (`bench/src/hosts/pi.ts`): turns mock tools into Pi tools. The
    catalog builds zod schemas and JSON schemas; Pi takes TypeBox schemas, so verify that a JSON
    schema can be wrapped (for example `Type.Unsafe`) or convert the parameter specs directly.
  - **`krino-bench --host pi`**: the three tool setups (`baseline`, `per-step`, `step-zero`)
    through a Pi SDK session with the log-triage agent from `examples/pi-cli`. `per-step` uses
    `setActiveTools` before every turn (bench-only code, never exported), to show whether Pi's
    tool-change delta keeps or breaks the cache.
  - **Routing setups** on `--host ai-sdk` and `--host pi`: `fallback-only` (every run on the
    fallback model) vs. `routing-enforce` (krino routes, `explorationRate: 0`). Results show
    cost per task, success rate (the bench's existing scoring), and steps per task for each
    setup.
  - **`--fake`** for Pi: a scripted Pi model that follows the same cache rule as the AI SDK mock
    (same tool list → cache read; changed list → cache write) and labels the output
    `SIMULATED — not real measurements.` Fake routing uses a scripted fake provider.
  - **Live** (behind `KRINO_LIVE=1` and the existing spend guard): measures plan V6, the real
    cache effect of a tool change through Pi on one Anthropic and one OpenAI model.
  - Update `bench-runner/README.md`: the new hosts, setups, and how to read routing results
    (cost and success rate together, never cost alone).
- **Acceptance:**
  - [ ] `--fake --host pi` and `--fake` routing setups run in CI with no network.
  - [ ] Results are stable across 2 fake reruns (same bar as v0.1).
  - [ ] The spend guard covers the new live setups; the plan is printed before spending.
  - [ ] Bench-only code stays out of `@krinolabs/krino` (an import test).
  - [ ] The PR states the live V6 result, or that the live run is still pending for
        verification day.

---

## 🚀 Kickoff prompt (paste into Claude Code, Codex, or Cursor)

```text
You are working on krino, a TypeScript decision layer for AI agents.
Read AGENTS.md, docs/plan/shared/03-contracts.md, docs/plan/shared/04-behavior-rules.md and
docs/plan/work-packages/pi-host-and-model-routing.md first.
Your task is WP-26 (Benchmark on Pi), described in docs/plan/work-packages/wp-26-bench-on-pi.md.
Do only what it lists, write only inside its "Owns" paths, and meet every acceptance criterion.
Work on branch wp-26-bench-on-pi in its own git worktree. When done, run
`pnpm turbo run lint typecheck test build` and open a PR with: WP id, what you built, how you
tested it, Pi and ai versions you verified, open questions, and any deviation from the card.
If you need a contract change, stop and explain it in the PR instead.
```
