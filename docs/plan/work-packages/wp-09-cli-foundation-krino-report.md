# WP-09 · CLI foundation + `krino report`

> **Branch:** `wp-09-cli-foundation-krino-report`  |  **Status:** ✅ merged ([PR #9](https://github.com/krinolabs/krino/pull/9))
> **Read first:** [`AGENTS.md`](../../../AGENTS.md), [`03-contracts.md`](../shared/03-contracts.md), [`04-behavior-rules.md`](../shared/04-behavior-rules.md)
> **Before you open a PR:** [`05-review-checklist.md`](../shared/05-review-checklist.md)

- **Owner role:** Cursor.
- **Depends on:** [WP-01](./wp-01-contracts.md).
- **Owns:** `packages/cli/src/**` except `commands/bench*`, `commands/init*`, `commands/doctor*`.
- **Deliverables:**
  - CLI shell with citty; `bin: { "krino": "./dist/index.js" }`; banner from the brand pack (respects `NO_COLOR` and non-TTY).
  - Trace reader on DuckDB (`@duckdb/node-api`; verify package name and version) over the JSONL folder.
  - `krino report [--project] [--since 7d] [--json]`:
    - Per decision kind and mode: calls, agreement, cost saved if enforced (with cache costs), added latency.
    - Cache health: share of input tokens read from cache, written, uncached.
    - Cut-off count.
    - One "next step" line (for example: agreement ≥ 90% → try enforce on step 0).
    - Agreement shown **per host**, labeled with its metric.
  - Validates each line's `traceSchemaVersion`; skips and counts bad lines.
- **Acceptance:**
  - [ ] Snapshot tests on fixture trace folders (both hosts, with cut-offs and bad lines).
  - [ ] `--json` output has a stable, documented shape.
  - [ ] Runs on a 100 MB trace folder in under 5 seconds (measure; report the number).

---

## 🚀 Kickoff prompt (paste into Claude Code, Codex, or Cursor)

```text
You are working on krino, a TypeScript decision layer for AI agents.
Read AGENTS.md, docs/plan/shared/03-contracts.md and docs/plan/shared/04-behavior-rules.md first.
Your task is WP-09 (CLI foundation + krino report), described in docs/plan/work-packages/wp-09-cli-foundation-krino-report.md.
Do only what it lists, write only inside its "Owns" paths, and meet every acceptance criterion.
Work on branch wp-09-cli-foundation-krino-report. When done, run `pnpm turbo run lint typecheck test build`
and open a PR with: WP id, what you built, how you tested it, SDK versions you verified,
open questions, and any deviation from the card.
If you need a contract change, stop and explain it in the PR instead.
```
