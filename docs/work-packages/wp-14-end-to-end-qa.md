# WP-14 · End-to-end QA

> **Branch:** `wp-14-end-to-end-qa`  |  **Status:** ☐ not started
> **Read first:** [`AGENTS.md`](../AGENTS.md), [`03-contracts.md`](../shared/03-contracts.md), [`04-behavior-rules.md`](../shared/04-behavior-rules.md)
> **Before you open a PR:** [`05-review-checklist.md`](../shared/05-review-checklist.md)

- **Owner role:** Claude Code.
- **Depends on:** [WP-12](./wp-12-examples.md) (and everything before it).
- **Owns:** `e2e/**`.
- **Deliverables:**
  - Packs both packages (`npm pack`), installs them into a temp project, runs each example with `--fake`, then runs `krino report --json` and asserts on the output.
  - Checks the published type declarations compile in a consumer project with `strict`.
- **Acceptance:**
  - [ ] Runs in CI in under 3 minutes.
  - [ ] Fails if any package imports a host SDK from the root entry point.

---

## 🚀 Kickoff prompt (paste into Claude Code, Codex, or Cursor)

```text
You are working on krino, a TypeScript decision layer for AI agents.
Read AGENTS.md, docs/plan/shared/03-contracts.md and docs/plan/shared/04-behavior-rules.md first.
Your task is WP-14 (End-to-end QA), described in docs/plan/work-packages/wp-14-end-to-end-qa.md.
Do only what it lists, write only inside its "Owns" paths, and meet every acceptance criterion.
Work on branch wp-14-end-to-end-qa. When done, run `pnpm turbo run lint typecheck test build`
and open a PR with: WP id, what you built, how you tested it, SDK versions you verified,
open questions, and any deviation from the card.
If you need a contract change, stop and explain it in the PR instead.
```
