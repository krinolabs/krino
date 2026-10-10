# WP-23 · `krino report`: Pi, model routing, trace v2

> **Branch:** `wp-23-report-pi-model-routing`  |  **Status:** ☐ not started
> **Read first:** [`AGENTS.md`](../../../AGENTS.md), [`03-contracts.md`](../shared/03-contracts.md), [`04-behavior-rules.md`](../shared/04-behavior-rules.md), [the v0.2 plan](./pi-host-and-model-routing.md), ADR-023, ADR-026
> **Before you open a PR:** [`05-review-checklist.md`](../shared/05-review-checklist.md)

- **Owner role:** Codex.
- **Depends on:** [WP-16](./wp-16-contracts-v2-adrs.md). Check real output against
  [WP-17](./wp-17-core-model-routing.md) traces before merging.
- **Owns:** `packages/cli/src/report/**`, `packages/cli/src/trace-reader/**`,
  `packages/cli/src/commands/report*`.
- **Deliverables:**
  - **Trace v2:** read schema versions 1 and 2 in the same folder. Missing v2 fields read as
    `null`. A record with a newer version is skipped and counted, with a hint to update the CLI.
  - **Pi host:** add `pi` to the per-run agreement hosts. Its agreement means "every used tool
    is inside the session's locked suggestion" (label it in text and JSON).
  - **Model routing section**, per host and mode:
    - Suggestions by model: count and share of runs.
    - Enforce: how often the routed model was used vs. the fallback, and why (timed out,
      failed, low confidence, exploration, unsupported).
    - **Estimated saving if enforced** (shadow) = sum of (actual cost − counterfactual cost)
      over runs with a suggestion. Enforce shows the measured saving against the fallback.
      Label both "estimated".
    - **Quality proxies:** routed runs vs. fallback and exploration runs: average steps, error
      rate, abort rate. Show a sample-size warning under 30 runs per group.
  - `next-step.ts`: a routing hint ("keep routing in shadow" or "try enforce") using the same
    style as the tool-selection hint, and never suggesting enforce when the quality proxies are
    worse for routed runs.
  - `--json`: add the new fields and bump the report JSON version. Update
    `packages/cli/src/report/README.md` with the new shape.
- **Acceptance:**
  - [ ] Fixtures: mixed v1 + v2 folders; Pi shadow and enforce runs; AI SDK routing runs; a run
        with an unknown model price (counterfactual `null`).
  - [ ] Snapshot tests for the text and JSON output.
  - [ ] 100 MB of mixed traces still report in under 5 s (same bar as v0.1).
  - [ ] Model identifiers `'constructor'`, `'toString'`, and `'__proto__'` group correctly.

---

## 🚀 Kickoff prompt (paste into Claude Code, Codex, or Cursor)

```text
You are working on krino, a TypeScript decision layer for AI agents.
Read AGENTS.md, docs/plan/shared/03-contracts.md, docs/plan/shared/04-behavior-rules.md and
docs/plan/work-packages/pi-host-and-model-routing.md first.
Your task is WP-23 (krino report: Pi, model routing, trace v2), described in
docs/plan/work-packages/wp-23-report-pi-model-routing.md.
Do only what it lists, write only inside its "Owns" paths, and meet every acceptance criterion.
Work on branch wp-23-report-pi-model-routing in its own git worktree. When done, run
`pnpm turbo run lint typecheck test build` and open a PR with: WP id, what you built, how you
tested it, versions you verified, open questions, and any deviation from the card.
If you need a contract change, stop and explain it in the PR instead.
```
