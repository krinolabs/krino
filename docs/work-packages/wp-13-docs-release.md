# WP-13 · Docs + release

> **Branch:** `wp-13-docs-release`  |  **Status:** ☐ not started
> **Read first:** [`AGENTS.md`](../AGENTS.md), [`03-contracts.md`](../shared/03-contracts.md), [`04-behavior-rules.md`](../shared/04-behavior-rules.md)
> **Before you open a PR:** [`05-review-checklist.md`](../shared/05-review-checklist.md)

- **Owner role:** Cursor (lead reviews every word).
- **Depends on:** [WP-10](./wp-10-krino-bench.md), [WP-11](./wp-11-krino-init-krino-doctor.md), [WP-14](./wp-14-end-to-end-qa.md).
- **Owns:** `README.md`, `packages/*/README.md`, `docs/**` except `docs/adr/`.
- **Deliverables:**
  - Root README: light/dark banner (`<picture>`), 30-second pitch, install, 10-line quick start per host, shadow → report → enforce flow, link to the build guide concepts.
  - Package READMEs (npm uses absolute image URLs).
  - Changesets for v0.1.0; release workflow dry run.
- **Acceptance:**
  - [ ] Quick starts copy-paste and run in a fresh project (lead verifies).
  - [ ] Plain, short sentences; every number has a source or says "example".

---

## 🚀 Kickoff prompt (paste into Claude Code, Codex, or Cursor)

```text
You are working on krino, a TypeScript decision layer for AI agents.
Read AGENTS.md, docs/plan/shared/03-contracts.md and docs/plan/shared/04-behavior-rules.md first.
Your task is WP-13 (Docs + release), described in docs/plan/work-packages/wp-13-docs-release.md.
Do only what it lists, write only inside its "Owns" paths, and meet every acceptance criterion.
Work on branch wp-13-docs-release. When done, run `pnpm turbo run lint typecheck test build`
and open a PR with: WP id, what you built, how you tested it, SDK versions you verified,
open questions, and any deviation from the card.
If you need a contract change, stop and explain it in the PR instead.
```
