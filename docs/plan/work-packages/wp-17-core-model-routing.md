# WP-17 · Core: model routing, trace v2, host prices

> **Branch:** `wp-17-core-model-routing`  |  **Status:** ☐ not started
> **Read first:** [`AGENTS.md`](../../../AGENTS.md), [`03-contracts.md`](../shared/03-contracts.md), [`04-behavior-rules.md`](../shared/04-behavior-rules.md), [the v0.2 plan](./pi-host-and-model-routing.md), ADR-023, ADR-026
> **Before you open a PR:** [`05-review-checklist.md`](../shared/05-review-checklist.md)

- **Owner role:** Claude Code.
- **Depends on:** [WP-16](./wp-16-contracts-v2-adrs.md).
- **Owns:** `packages/krino/src/core/**`, `packages/krino/src/pricing/**`.
- **Deliverables:**
  - **`decideModelRoute`** in the run handle, following the model-routing rules:
    - Builds one choice question whose `options` are the available candidates (policy
      candidates ∩ `availableCandidateIdentifiers`) and whose `optionCriteria` are their
      `useWhen` lines. Put the question shape in a pure function next to
      `buildToolSelectionQuestions`, with the question text documented for the providers
      (WP-19).
    - Decides once per run, at step 0. Every later call in the run returns the locked model with
      no new decision.
    - Shadow: returns `hostModelIdentifier` at once; asks in the background; records the
      suggestion when it arrives.
    - Enforce: waits up to `decisionTimeoutInMilliseconds`. A confident answer that names an
      available candidate wins; everything else uses the fallback. Exploration
      (`explorationRate`) uses the fallback with `skippedExploration`.
    - Fallback not available, the host does not support `modelRouting`, or enforce with
      `canApplyRoute: false`: `skippedUnsupported`; return `hostModelIdentifier`. Shadow with
      `canApplyRoute: false` still asks and records the suggestion.
    - Context over budget: trim; retry once; else fallback (`failed`).
    - Never throws into the host: unexpected errors return `hostModelIdentifier` (shadow) or
      the fallback (enforce) and warn.
  - **Config resolution** (`resolve-config.ts`): add `modelRouting` to `DECISION_KINDS`; validate
    `modelRoutingPolicy` (2–4 candidates, unique identifiers, non-blank `useWhen`, fallback in the
    list); the default mode is `shadow` (WP-16 defaults), and without a policy routing makes no
    decision and writes no record; `enforce` without a policy is a `KrinoConfigurationError`.
  - Replace WP-16's `TODO(WP-17)` placeholders in `run-handle.ts` (`decideModelRoute` and the
    two run-summary fields).
  - **Trace v2:** write `traceSchemaVersion: 2`. At `finishRun`, fill
    `routingCounterfactualCostInUsd` (the run's total usage priced at the suggested model in
    shadow, or at the fallback in enforce; `null` without a routing decision or a known price)
    and pass `runOutcome` through from the adapter.
  - **Price precedence** (`pricing/`): `priceOverrides` → `RunStartOptions.hostModelPrices` →
    `DEFAULT_MODEL_PRICES`. Add a pure helper that turns per-million prices with absolute cache
    prices into a `ModelPrice` (Pi's catalog gives absolute cache prices, not multipliers).
  - Keep the dependency rules: `core/` imports only `contracts/` and `pricing/`.
- **Acceptance:**
  - [ ] A test for every model-routing row in `04-behavior-rules.md` (shadow, timeout, error,
        low probability, unknown model in answer, over budget, unsupported, exploration,
        cut-off).
  - [ ] Shadow adds 0 ms: a test with a 5 s provider returns at once.
  - [ ] Sticky: 5 calls in one run make one provider call and return one model.
  - [ ] Candidate identifiers `'constructor'`, `'toString'`, and `'__proto__'` work (no plain
        object indexing).
  - [ ] Counterfactual cost includes cache read and write tokens; a test checks the math.
  - [ ] Existing tool-selection and risk-gate tests still pass unchanged.

---

## 🚀 Kickoff prompt (paste into Claude Code, Codex, or Cursor)

```text
You are working on krino, a TypeScript decision layer for AI agents.
Read AGENTS.md, docs/plan/shared/03-contracts.md, docs/plan/shared/04-behavior-rules.md and
docs/plan/work-packages/pi-host-and-model-routing.md first.
Your task is WP-17 (Core: model routing, trace v2, host prices), described in
docs/plan/work-packages/wp-17-core-model-routing.md.
Do only what it lists, write only inside its "Owns" paths, and meet every acceptance criterion.
Work on branch wp-17-core-model-routing in its own git worktree. When done, run
`pnpm turbo run lint typecheck test build` and open a PR with: WP id, what you built, how you
tested it, versions you verified, open questions, and any deviation from the card.
If you need a contract change, stop and explain it in the PR instead.
```
