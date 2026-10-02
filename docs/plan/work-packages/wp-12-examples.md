# WP-12 · Examples

> **Branch:** `wp-12-examples`  |  **Status:** ☐ not started
> **Read first:** [`AGENTS.md`](../../../AGENTS.md), [`03-contracts.md`](../shared/03-contracts.md), [`04-behavior-rules.md`](../shared/04-behavior-rules.md)
> **Before you open a PR:** [`05-review-checklist.md`](../shared/05-review-checklist.md)

- **Owner role:** Cursor.
- **Depends on:** [WP-05](./wp-05-mock-tool-catalog-task-set.md), [WP-06](./wp-06-vercel-ai-sdk-adapter.md), [WP-07](./wp-07-claude-agent-sdk-adapter.md).
- **Owns:** `examples/**`.
- **Deliverables:**
  - `examples/ai-sdk-cli`: a log-triage CLI agent on the AI SDK using the mock catalog; krino in shadow mode.
  - `examples/claude-agent-sdk-cli`: the same agent on the Claude Agent SDK.
  - Each has a README: install, set keys, run, then `krino report`.
  - `--fake` flag to run without any API key.
- **Acceptance:**
  - [ ] Both run with `--fake` in CI.
  - [ ] Both produce traces that `krino report` reads.

---

## 🚀 Kickoff prompt (paste into Claude Code, Codex, or Cursor)

```text
You are working on krino, a TypeScript decision layer for AI agents.
Read AGENTS.md, docs/plan/shared/03-contracts.md and docs/plan/shared/04-behavior-rules.md first.
Your task is WP-12 (Examples), described in docs/plan/work-packages/wp-12-examples.md.
Do only what it lists, write only inside its "Owns" paths, and meet every acceptance criterion.
Work on branch wp-12-examples. When done, run `pnpm turbo run lint typecheck test build`
and open a PR with: WP id, what you built, how you tested it, SDK versions you verified,
open questions, and any deviation from the card.
If you need a contract change, stop and explain it in the PR instead.
```
