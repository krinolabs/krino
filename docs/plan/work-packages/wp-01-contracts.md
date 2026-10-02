# WP-01 · Contracts

> **Branch:** `wp-01-contracts`  |  **Status:** ☐ not started
> **Read first:** [`AGENTS.md`](../../../AGENTS.md), [`03-contracts.md`](../shared/03-contracts.md), [`04-behavior-rules.md`](../shared/04-behavior-rules.md)
> **Before you open a PR:** [`05-review-checklist.md`](../shared/05-review-checklist.md)

- **Owner role:** lead (or Claude Code with lead review).
- **Depends on:** [WP-00](./wp-00-repo-scaffold.md).
- **Owns:** `packages/krino/src/contracts/**`, `docs/adr/ADR-0xx-*.md` (copy ADRs from the build guide).
- **Deliverables:**
  - All types in `shared/03-contracts.md`, split by file, re-exported from `contracts/index.ts`.
  - `defaults.ts`: default config values from the comments in `shared/03-contracts.md`.
  - `errors.ts`: `KrinoConfigurationError`, `DecisionProviderError`, `DecisionTimeoutError`.
  - `stub-runtime.ts`: a `KrinoRuntime` stub that returns shadow outcomes and records to memory. **Adapters ([WP-06](./wp-06-vercel-ai-sdk-adapter.md), [WP-07](./wp-07-claude-agent-sdk-adapter.md)) use it until [WP-02](./wp-02-core-runtime.md) merges.**
- **Acceptance:**
  - [ ] Types compile; no `any`; descriptive names; `Array<T>` syntax.
  - [ ] The stub runtime has unit tests.
  - [ ] PR lists any deviation from `shared/03-contracts.md`.
- **After merge:** contracts are frozen.

---

## 🚀 Kickoff prompt (paste into Claude Code, Codex, or Cursor)

```text
You are working on krino, a TypeScript decision layer for AI agents.
Read AGENTS.md, docs/plan/shared/03-contracts.md and docs/plan/shared/04-behavior-rules.md first.
Your task is WP-01 (Contracts), described in docs/plan/work-packages/wp-01-contracts.md.
Do only what it lists, write only inside its "Owns" paths, and meet every acceptance criterion.
Work on branch wp-01-contracts. When done, run `pnpm turbo run lint typecheck test build`
and open a PR with: WP id, what you built, how you tested it, SDK versions you verified,
open questions, and any deviation from the card.
If you need a contract change, stop and explain it in the PR instead.
```
