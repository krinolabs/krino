# WP-10 · `krino-bench` (private command in `@krinolabs/bench-runner`)

> **Branch:** `wp-10-krino-bench`  |  **Status:** ✅ merged ([PR #15](https://github.com/krinolabs/krino/pull/15))
> **Read first:** [`AGENTS.md`](../../../AGENTS.md), [`03-contracts.md`](../shared/03-contracts.md), [`04-behavior-rules.md`](../shared/04-behavior-rules.md)
> **Before you open a PR:** [`05-review-checklist.md`](../shared/05-review-checklist.md)

- **Owner role:** Claude Code.
- **Depends on:** [WP-05](./wp-05-mock-tool-catalog-task-set.md), [WP-06](./wp-06-vercel-ai-sdk-adapter.md), [WP-09](./wp-09-cli-foundation-krino-report.md).
- **Owns:** `packages/cli/src/commands/bench*`, `bench/runner/**`.
- **Deliverables:**
  - `krino-bench --setups baseline,per-step,step-zero --runs 100 [--pilot] [--max-spend-usd 20]`:
    - `baseline`: no routing.
    - `per-step`: prunes tools on every step. **Bench-only code path** to show the cache trap; never exported by the core.
    - `step-zero`: krino enforce mode.
  - Uses the AI SDK host, the mock catalog, a Haiku-class model by default, and the real Jev provider (fake provider with `--fake`).
  - `--pilot` = 10 runs per setup.
  - **Scoring:** selection recall is the primary metric (all expected tools inside the
    suggested set). Also report set size and, for multiStep tasks only, sequence match.
    See bench/README.md.
  - **Record the setup:** whether the MCP server loaded all tools, and the description
    token count, in every bench output.
  - **Spend guard:** estimates cost before starting; stops when spend reaches `--max-spend-usd`.
  - Writes traces under a bench project name, then prints the comparison via the report engine: cost per step, cache read share, tool accuracy vs `expectedToolNames`, latency.
  - Records model versions, SDK versions, and run date in the output.
- **Acceptance:**
  - [ ] `krino-bench --fake --pilot` runs offline in CI (uses the AI SDK mock model).
  - [ ] Spend guard test: stops at the limit with a clear message.
  - [ ] Output includes everything needed for the blog chart.
- **Approved edit:** register your command with one line in
  `packages/cli/src/main-command.ts`.
- Use `--trace-dir` and `resolveTraceDirectory` from `@krinolabs/krino`; do not copy folder rules.

---

## 🚀 Kickoff prompt (paste into Claude Code, Codex, or Cursor)

```text
You are working on krino, a TypeScript decision layer for AI agents.
Read AGENTS.md, docs/plan/shared/03-contracts.md and docs/plan/shared/04-behavior-rules.md first.
Your task is WP-10 (krino-bench, a private command in @krinolabs/bench-runner), described in docs/plan/work-packages/wp-10-krino-bench.md.
Do only what it lists, write only inside its "Owns" paths, and meet every acceptance criterion.
Work on branch wp-10-krino-bench. When done, run `pnpm turbo run lint typecheck test build`
and open a PR with: WP id, what you built, how you tested it, SDK versions you verified,
open questions, and any deviation from the card.
If you need a contract change, stop and explain it in the PR instead.
```

- Use `selectToolSubset` from `@krinolabs/bench` for the scaling check (same-domain-first
  fill). Do not write another subset helper.
