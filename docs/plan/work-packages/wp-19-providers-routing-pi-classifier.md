# WP-19 · Providers: routing questions + Pi classifier

> **Branch:** `wp-19-providers-routing-pi-classifier`  |  **Status:** ☐ not started
> **Read first:** [`AGENTS.md`](../../../AGENTS.md), [`03-contracts.md`](../shared/03-contracts.md), [`04-behavior-rules.md`](../shared/04-behavior-rules.md), [the v0.2 plan](./pi-host-and-model-routing.md), ADR-018, ADR-023, ADR-025
> **Before you open a PR:** [`05-review-checklist.md`](../shared/05-review-checklist.md)

- **Owner role:** Codex.
- **Depends on:** [WP-16](./wp-16-contracts-v2-adrs.md). Uses the question shape from
  [WP-17](./wp-17-core-model-routing.md); agree on it early through the WP-17 PR draft.
- **Owns:** `packages/krino/src/providers/**`.
- **Deliverables:**
  - **Jev through AI Gateway** (`jev-ai-gateway/`): choice questions send `optionCriteria` as
    the Jev criteria (today they are `null`). Recorded fixtures for a model-routing answer.
  - **Fake provider** (`fake/`): scripted answers for `modelRouting`; the
    `answerConservatively` rule answers with the first option at probability 0.5 (below the
    default minimum, so enforce uses the fallback).
  - **Pi classifier provider** (`pi-classifier/`, new):
    `createPiClassifierProvider({ classifierClient, classifierModel, onClassification? })`.
    - `classifierClient` is a **structural type** with one method, `classify(model, context,
      options)`, matching `ModelRegistry.classify` in `@earendil-works/pi-coding-agent` 1.1.0.
      Use type-only imports from `@earendil-works/pi-ai` (WP-16 adds it as a devDependency and
      optional peer). No runtime import of any Pi package.
    - Maps `DecisionQuestion` to Pi's `ClassifierContext`: yes/no → `bool` (criteria
      `{ true, false }`); options → `choice` (criteria from `optionCriteria`, else the option
      text). The state holds the task, recent messages, and available tools, like the Jev state.
    - Maps `ClassifierResult` back to `DecisionAnswer`: `bool.probability`; for `choice`, the
      chosen option and its probability. `stopReason` `"error"` or `"aborted"` →
      `DecisionProviderError` or `DecisionTimeoutError`. `classify` never rejects, but guard
      anyway.
    - Calls `classify(model, context, { signal, timeoutMs, maxRetries: 0 })`. Verified (V5):
      `classify` has **no default timeout** and **`maxRetries` defaults to 2**, so a decision
      could otherwise retry past its deadline. `timeoutMs` = `timeoutInMilliseconds`; `signal` =
      `requestOptions.abortSignal`. A failure comes back as `stopReason` `"aborted"` (the signal
      fired) or `"error"` with `errorMessage`, never as a rejection.
    - `decisionModelVersion` = `provider/model` from the result. **Decision cost comes from
      krino's price table**, using the result's token counts when present. Pi's catalog prices
      `typesafe/jev-latest` at 0, so `usage.cost.total` is always 0 (verified). Make sure
      `findModelPrice` maps `typesafe/jev-latest` to the Jev price entry. If that needs a new alias
      in `pricing/` (WP-17's path), raise it in the PR.
    - Never logs or keeps the classifier state or credentials; errors keep only the name,
      message, and status (same rule as the Jev provider).
    - Exported only from `@krinolabs/krino/pi` (WP-20 re-exports it). The root entry never
      imports it.
  - **Already verified** (V5, [`../pi-verification-1.1.0.md`](../pi-verification-1.1.0.md)):
    `typesafe/jev-latest` is in Pi's bundled catalog (type `classifier`, api
    `typesafe-system-one`). Credentials come from Pi's auth store (`/login`) first, then
    `TYPESAFE_API_KEY`. Choice answers carry `probabilities` and `confidence`. Still open: real
    latency against the 800 ms timeout (verification day, needs a key).
- **Acceptance:**
  - [ ] No network in tests: recorded `ClassifierResult` fixtures (answered, low confidence,
        error, aborted) and AI Gateway fixtures.
  - [ ] Tool names and model identifiers `'constructor'`, `'toString'`, and `'__proto__'` map
        correctly (no plain object indexing; `answers` and `probabilities` read with
        `Object.hasOwn`).
  - [ ] A timeout test: a classifier that never resolves gives `DecisionTimeoutError` within
        the timeout.
  - [ ] The root-entry test (`root-entry.test.ts`) still proves the root imports no Pi package.
  - [ ] Every provider meets the 85% branch coverage bar.

---

## 🚀 Kickoff prompt (paste into Claude Code, Codex, or Cursor)

```text
You are working on krino, a TypeScript decision layer for AI agents.
Read AGENTS.md, docs/plan/shared/03-contracts.md, docs/plan/shared/04-behavior-rules.md and
docs/plan/work-packages/pi-host-and-model-routing.md first.
Your task is WP-19 (Providers: routing questions + Pi classifier), described in
docs/plan/work-packages/wp-19-providers-routing-pi-classifier.md.
Do only what it lists, write only inside its "Owns" paths, and meet every acceptance criterion.
Work on branch wp-19-providers-routing-pi-classifier in its own git worktree. When done, run
`pnpm turbo run lint typecheck test build` and open a PR with: WP id, what you built, how you
tested it, versions you verified (Pi packages, ai), open questions, and any deviation from the card.
If you need a contract change, stop and explain it in the PR instead.
```
