# WP-02 · Core runtime

> **Branch:** `wp-02-core-runtime`  |  **Status:** ☐ not started
> **Read first:** [`AGENTS.md`](../AGENTS.md), [`03-contracts.md`](../shared/03-contracts.md), [`04-behavior-rules.md`](../shared/04-behavior-rules.md)
> **Before you open a PR:** [`05-review-checklist.md`](../shared/05-review-checklist.md)

- **Owner role:** Claude Code.
- **Depends on:** [WP-01](./wp-01-contracts.md).
- **Owns:** `packages/krino/src/core/**`, `packages/krino/src/pricing/**`, `packages/krino/src/index.ts` (exports only).
- **Reads:** `shared/03-contracts.md`, `shared/04-behavior-rules.md`.
- **Deliverables:**
  - `createKrino(config)`: validates config, applies defaults, returns `KrinoRuntime`.
  - `RunHandle` implementation:
    - `decideToolSelection`: builds questions, calls the provider (background in shadow, awaited with timeout in enforce), applies fail-open rules, exploration sampling via `randomSource`.
    - `checkToolCallRisk`: calls the risk-gate policy module ([WP-08](./wp-08-risk-gate-policy.md); use its exported signature, stub until merged), always in shadow for v0.1.
    - `recordStep` / `finishRun`: fill trace fields, compute costs, write to sink.
  - **Pending-decision tracker:** every background call is tracked; `finishRun` and `flushAll` wait up to a timeout, then write `cutOff` records.
  - **Context budget:** trim `recentMessagesText` to fit 32,000 tokens (estimate: characters ÷ 4, with a 10% margin).
  - **Cost calculator:** `costFromUsage(tokenUsage, modelPrice)` including cache multipliers.
  - **Price table:** Claude Haiku, Sonnet, and Opus current models + Jev, each with `verifiedOn`. Mark every price "verify before release".
- **Acceptance:**
  - [ ] Every row in `shared/04-behavior-rules.md` has a test (use the fake provider from [WP-03](./wp-03-decision-providers.md), or a local test double until it merges).
  - [ ] Shadow mode adds no await to the caller (test with a provider that takes 5 s).
  - [ ] `finishRun` with a slow provider writes `cutOff` within the flush timeout.
  - [ ] Property tests (fast-check): cost ≥ 0; fail-closed never yields `allow` on error.
  - [ ] Line coverage ≥ 90% for `core/`.
- **Out of scope:** host-specific code, file I/O.

---

## 🚀 Kickoff prompt (paste into Claude Code, Codex, or Cursor)

```text
You are working on krino, a TypeScript decision layer for AI agents.
Read AGENTS.md, docs/plan/shared/03-contracts.md and docs/plan/shared/04-behavior-rules.md first.
Your task is WP-02 (Core runtime), described in docs/plan/work-packages/wp-02-core-runtime.md.
Do only what it lists, write only inside its "Owns" paths, and meet every acceptance criterion.
Work on branch wp-02-core-runtime. When done, run `pnpm turbo run lint typecheck test build`
and open a PR with: WP id, what you built, how you tested it, SDK versions you verified,
open questions, and any deviation from the card.
If you need a contract change, stop and explain it in the PR instead.
```
