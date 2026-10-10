# WP-21 · AI SDK model routing

> **Branch:** `wp-21-ai-sdk-model-routing`  |  **Status:** ☐ not started
> **Read first:** [`AGENTS.md`](../../../AGENTS.md), [`03-contracts.md`](../shared/03-contracts.md), [`04-behavior-rules.md`](../shared/04-behavior-rules.md), [the v0.2 plan](./pi-host-and-model-routing.md), ADR-020, ADR-023
> **Before you open a PR:** [`05-review-checklist.md`](../shared/05-review-checklist.md)

- **Owner role:** Claude Code.
- **Depends on:** [WP-16](./wp-16-contracts-v2-adrs.md) to start;
  [WP-17](./wp-17-core-model-routing.md) and [WP-19](./wp-19-providers-routing-pi-classifier.md)
  to finish.
- **Owns:** `packages/krino/src/adapters/ai-sdk/**`.
- **Deliverables:**
  - `withKrino(callOptions, krinoRuntime, withKrinoOptions?)`: a new optional third argument,
    so existing calls keep working. Options:
    - `modelRoutingPolicy?`: the same policy passed to `createKrino`. Without it there is no
      routing.
    - `resolveModel?: (modelIdentifier: string) => LanguageModel`. Default: pass the identifier
      string through (the AI SDK resolves strings with its default provider, AI Gateway).
  - At step 0, `decideModelRoute` with the step-0 context, `hostModelIdentifier` = the call's
    `model` (string, or the model's `provider/modelId`), all candidates available, and
    `canApplyRoute: true`.
  - **Enforce:** return the routed model from `prepareStep` on **every** step (sticky), if
    `prepareStep`'s `model` lasts one step only, like `activeTools` (verify, plan V7). Shadow and
    off return no `model`.
  - The caller's `prepareStep` runs first, as today. If it returns a `model`, it wins, and krino
    warns once per process that this can break the prompt cache (same pattern as ADR-020).
  - Capabilities add `'modelRouting'` to `supportedDecisions`.
  - Step traces keep using the response's model; the runtime fills
    `routingCounterfactualCostInUsd`. Pass `runOutcome` from the finish reason or error.
  - Do not touch the Claude Agent SDK adapter; it does not declare `modelRouting`.
- **Acceptance:**
  - [ ] Tests run without network (`MockLanguageModelV4` from `ai/test`, as in
        `test-support.ts`).
  - [ ] Enforce returns the same model on all steps of a 5-step run (cache guard), and the tool
        list guard from ADR-020 still passes.
  - [ ] Shadow returns no `model` and adds 0 ms.
  - [ ] Timeout, error, and low confidence route to the fallback.
  - [ ] Calls without the third argument behave exactly as before (existing tests unchanged).
  - [ ] **Verify** plan V7 against the installed `ai` version and record it in the PR. If the
        `model` override persists across steps, write a short ADR-020 addendum proposal in the
        PR instead of the per-step return.

---

## 🚀 Kickoff prompt (paste into Claude Code, Codex, or Cursor)

```text
You are working on krino, a TypeScript decision layer for AI agents.
Read AGENTS.md, docs/plan/shared/03-contracts.md, docs/plan/shared/04-behavior-rules.md and
docs/plan/work-packages/pi-host-and-model-routing.md first.
Your task is WP-21 (AI SDK model routing), described in docs/plan/work-packages/wp-21-ai-sdk-model-routing.md.
Do only what it lists, write only inside its "Owns" paths, and meet every acceptance criterion.
Work on branch wp-21-ai-sdk-model-routing in its own git worktree. When done, run
`pnpm turbo run lint typecheck test build` and open a PR with: WP id, what you built, how you
tested it, ai versions you verified, open questions, and any deviation from the card.
If you need a contract change, stop and explain it in the PR instead.
```
