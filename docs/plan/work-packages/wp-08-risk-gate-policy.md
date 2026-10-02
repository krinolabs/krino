# WP-08 · Risk gate policy

> **Branch:** `wp-08-risk-gate-policy`  |  **Status:** ☐ not started
> **Read first:** [`AGENTS.md`](../../../AGENTS.md), [`03-contracts.md`](../shared/03-contracts.md), [`04-behavior-rules.md`](../shared/04-behavior-rules.md)
> **Before you open a PR:** [`05-review-checklist.md`](../shared/05-review-checklist.md)

- **Owner role:** Codex.
- **Depends on:** [WP-01](./wp-01-contracts.md).
- **Owns:** `packages/krino/src/risk-gate/**`.
- **Deliverables:**
  - Pure function: `evaluateRiskGate({ pendingToolCall, riskGatePolicy, providerAnswer, providerFailure })` → `RiskGateVerdict` + `DecisionStatus`.
  - Order: block list → allow list → missing threshold → provider answer vs threshold → any failure = `askHuman`.
  - `buildRiskQuestion(pendingToolCall)`: sends tool name, structured arguments, and risk notes only. **Never raw tool results** (prompt-injection rule).
  - `thresholdFromCosts({ costOfAskingInUsd, costOfBadCallInUsd })` helper: `1 - costOfAsking / costOfBadCall`, clamped to 0..1.
- **Acceptance:**
  - [ ] Table-driven tests cover every row of the risk-gate column in `shared/04-behavior-rules.md`.
  - [ ] Property test: any provider failure → never `allow`.
  - [ ] A block-listed tool is `block` even when the provider says safe with probability 1.

---

## 🚀 Kickoff prompt (paste into Claude Code, Codex, or Cursor)

```text
You are working on krino, a TypeScript decision layer for AI agents.
Read AGENTS.md, docs/plan/shared/03-contracts.md and docs/plan/shared/04-behavior-rules.md first.
Your task is WP-08 (Risk gate policy), described in docs/plan/work-packages/wp-08-risk-gate-policy.md.
Do only what it lists, write only inside its "Owns" paths, and meet every acceptance criterion.
Work on branch wp-08-risk-gate-policy. When done, run `pnpm turbo run lint typecheck test build`
and open a PR with: WP id, what you built, how you tested it, SDK versions you verified,
open questions, and any deviation from the card.
If you need a contract change, stop and explain it in the PR instead.
```
