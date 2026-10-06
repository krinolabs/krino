# WP-03 · Decision providers

> **Branch:** `wp-03-decision-providers`  |  **Status:** ✅ merged ([PR #5](https://github.com/krinolabs/krino/pull/5))
> **Read first:** [`AGENTS.md`](../../../AGENTS.md), [`03-contracts.md`](../shared/03-contracts.md), [`04-behavior-rules.md`](../shared/04-behavior-rules.md)
> **Before you open a PR:** [`05-review-checklist.md`](../shared/05-review-checklist.md)

- **Owner role:** Codex.
- **Depends on:** [WP-01](./wp-01-contracts.md).
- **Owns:** `packages/krino/src/providers/**`.
- **Deliverables:**
  - **Fake provider** (`createFakeDecisionProvider`):
    - Scripted answers by question (exact match or function).
    - Configurable latency, timeout simulation, error injection, and a fixed `decisionModelVersion`.
    - Records every call for assertions.
  - **Jev provider via Vercel AI Gateway** (`createJevAiGatewayProvider`), exported from `@krinolabs/krino/providers/jev`:
    - Uses the AI SDK's Jev support (`experimental_evaluate`, model `typesafe-ai/jev`) through AI Gateway. **Verify the exact API in the AI SDK docs first; record the AI SDK version you tested in the PR.**
    - Maps `DecisionQuestion` → Jev choice / yes-no questions; one request for all questions.
    - Honors `abortSignal` and timeout; maps errors to `DecisionProviderError`.
    - Reads the key from `AI_GATEWAY_API_KEY`; never logs it.
    - Returns the real model version from the response if present.
  - **Recorded fixtures** for the Jev provider (sanitized JSON), used by unit tests.
  - `scripts/smoke-jev.ts`: one live call; skipped unless `KRINO_LIVE=1`; prints latency.
- **Acceptance:**
  - [ ] Unit tests use fixtures only; no network in tests.
  - [ ] Live smoke passes locally with a real key (lead runs it).
  - [ ] Importing `@krinolabs/krino` does **not** import `ai` (check the bundle).

---

## 🚀 Kickoff prompt (paste into Claude Code, Codex, or Cursor)

```text
You are working on krino, a TypeScript decision layer for AI agents.
Read AGENTS.md, docs/plan/shared/03-contracts.md and docs/plan/shared/04-behavior-rules.md first.
Your task is WP-03 (Decision providers), described in docs/plan/work-packages/wp-03-decision-providers.md.
Do only what it lists, write only inside its "Owns" paths, and meet every acceptance criterion.
Work on branch wp-03-decision-providers. When done, run `pnpm turbo run lint typecheck test build`
and open a PR with: WP id, what you built, how you tested it, SDK versions you verified,
open questions, and any deviation from the card.
If you need a contract change, stop and explain it in the PR instead.
```
