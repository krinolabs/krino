# WP-11 · `krino init` + `krino doctor`

> **Branch:** `wp-11-krino-init-krino-doctor`  |  **Status:** ☐ not started
> **Read first:** [`AGENTS.md`](../AGENTS.md), [`03-contracts.md`](../shared/03-contracts.md), [`04-behavior-rules.md`](../shared/04-behavior-rules.md)
> **Before you open a PR:** [`05-review-checklist.md`](../shared/05-review-checklist.md)

- **Owner role:** Codex.
- **Depends on:** [WP-09](./wp-09-cli-foundation-krino-report.md).
- **Owns:** `packages/cli/src/commands/init*`, `packages/cli/src/commands/doctor*`.
- **Deliverables:**
  - `krino init`: detects `ai` or `@anthropic-ai/claude-agent-sdk` in `package.json`; writes `krino.config.json` (project name, trace directory, modes all `shadow`); prints the wrapper snippet for the detected host. Never edits source files.
  - `krino doctor` checks, each with pass / warn / fail and a fix line:
    - Node version ≥ 22.
    - Host SDK version inside the tested range.
    - `AI_GATEWAY_API_KEY` present (value never printed).
    - Trace directory writable.
    - Recent traces exist and parse.
    - Cache health: warns if cache read share < 50% in recent multi-step runs.
- **Acceptance:**
  - [ ] Tests with temp directories for each check.
  - [ ] `doctor` exits 0 on pass/warn and 1 on any fail.

---

## 🚀 Kickoff prompt (paste into Claude Code, Codex, or Cursor)

```text
You are working on krino, a TypeScript decision layer for AI agents.
Read AGENTS.md, docs/plan/shared/03-contracts.md and docs/plan/shared/04-behavior-rules.md first.
Your task is WP-11 (krino init + krino doctor), described in docs/plan/work-packages/wp-11-krino-init-krino-doctor.md.
Do only what it lists, write only inside its "Owns" paths, and meet every acceptance criterion.
Work on branch wp-11-krino-init-krino-doctor. When done, run `pnpm turbo run lint typecheck test build`
and open a PR with: WP id, what you built, how you tested it, SDK versions you verified,
open questions, and any deviation from the card.
If you need a contract change, stop and explain it in the PR instead.
```
