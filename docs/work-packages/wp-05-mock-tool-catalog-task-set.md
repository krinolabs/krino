# WP-05 · Mock tool catalog + task set

> **Branch:** `wp-05-mock-tool-catalog-task-set`  |  **Status:** ☐ not started
> **Read first:** [`AGENTS.md`](../AGENTS.md), [`03-contracts.md`](../shared/03-contracts.md), [`04-behavior-rules.md`](../shared/04-behavior-rules.md)
> **Before you open a PR:** [`05-review-checklist.md`](../shared/05-review-checklist.md)

- **Owner role:** Cursor.
- **Depends on:** [WP-01](./wp-01-contracts.md).
- **Owns:** `bench/**`.
- **Deliverables:**
  - 100 tools across 10 domains (orders, refunds, shipping, coupons, customers, inventory, payments, returns, support tickets, logs).
  - 2–3 **look-alike tools** per domain (for example `get_order_status` vs `get_order_state`), with descriptions that say when *not* to use them.
  - Deterministic fake executors (fixed JSON by input).
  - A task set: 60 tasks, each with `expectedToolNames: Array<string>` and a difficulty tag (`easy | lookAlike | multiStep`).
  - Exports usable by both hosts: AI SDK `tool()` definitions and an in-process MCP server for the Claude Agent SDK. **Verify the Agent SDK custom-tool API first.**
- **Acceptance:**
  - [ ] Tool definitions total 15,000–20,000 tokens (report the count; estimate characters ÷ 4).
  - [ ] Every task's expected tools exist in the catalog (test).
  - [ ] No network, no randomness.

---

## 🚀 Kickoff prompt (paste into Claude Code, Codex, or Cursor)

```text
You are working on krino, a TypeScript decision layer for AI agents.
Read AGENTS.md, docs/plan/shared/03-contracts.md and docs/plan/shared/04-behavior-rules.md first.
Your task is WP-05 (Mock tool catalog + task set), described in docs/plan/work-packages/wp-05-mock-tool-catalog-task-set.md.
Do only what it lists, write only inside its "Owns" paths, and meet every acceptance criterion.
Work on branch wp-05-mock-tool-catalog-task-set. When done, run `pnpm turbo run lint typecheck test build`
and open a PR with: WP id, what you built, how you tested it, SDK versions you verified,
open questions, and any deviation from the card.
If you need a contract change, stop and explain it in the PR instead.
```
