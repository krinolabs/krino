# WP-16 · Contracts v2 + ADRs

> **Branch:** `wp-16-contracts-v2-adrs`  |  **Status:** ☐ not started
> **Read first:** [`AGENTS.md`](../../../AGENTS.md), [`03-contracts.md`](../shared/03-contracts.md), [`04-behavior-rules.md`](../shared/04-behavior-rules.md), [the v0.2 plan](./pi-host-and-model-routing.md) (sections 3–5)
> **Before you open a PR:** [`05-review-checklist.md`](../shared/05-review-checklist.md)

- **Owner role:** lead (or Claude Code with lead review). This is the only v0.2 WP that may
  edit `packages/krino/src/contracts/**`.
- **Depends on:** v0.1.0 released.
- **Owns:** `packages/krino/src/contracts/**`, `docs/adr/ADR-021-*.md` to `docs/adr/ADR-026-*.md`,
  `docs/plan/shared/01-scope.md`, `docs/plan/shared/03-contracts.md`,
  `docs/plan/shared/04-behavior-rules.md`, and the dependency fields of
  `packages/krino/package.json` (see below).
- **Deliverables:**
  - **Pi packages for later WPs:** add `@earendil-works/pi-coding-agent` and
    `@earendil-works/pi-ai` to `packages/krino/package.json` as pinned devDependencies (1.1.0, or
    the latest verified 1.x) and as optional peers (`>=1.1.0 <2`). Do not add the `./pi` export
    yet; WP-20 adds it with its entry file.
  - **Contract changes** from section 4 of the plan:
    - `decisions.ts`: `DecisionKind` adds `"modelRouting"`; `DecisionQuestion` gains an optional
      `optionCriteria` (one line per option, for choice questions).
    - `host.ts`: `HostName` adds `"pi"`; new `ModelCandidate`, `ModelRouteContext` (with
      `canApplyRoute`).
    - `config.ts`: new `ModelRoutingPolicy`; `KrinoConfig.modelRoutingPolicy?`.
    - `runtime.ts`: new `ModelRouteOutcome`; `RunHandle.decideModelRoute`;
      `RunStartOptions.hostModelPrices?`.
    - `trace.ts`: `TRACE_SCHEMA_VERSION = 2`; choice encoding for `modelRouting` (the model
      identifier); `RunSummaryTrace.routingCounterfactualCostInUsd` and `runOutcome`.
      `RunSummaryInput` also omits `routingCounterfactualCostInUsd` (the runtime fills it).
    - `defaults.ts`: document the `modelRouting` default (`shadow` with a policy, `off` without).
    - `stub-runtime.ts`: `decideModelRoute` returns `hostModelIdentifier` with a shadow record,
      so WP-20 and WP-21 can start before WP-17 merges.
    - `contracts.types.test.ts`: pin every new and changed type.
  - **ADRs** (status "Accepted" once merged), each with context, decision, alternatives
    rejected, and consequences:
    - ADR-021: Pi host. Run = one prompt; step = one turn; session tool lock; capabilities;
      handlers never throw (plan D21–D24).
    - ADR-022: Third package `@krinolabs/pi`; amends ADR-015 (D28). Open question: `ai` as a
      regular dependency for the optional Gateway provider.
    - ADR-023: Model routing decision kind. Fail open to the fallback; first request of a run;
      sticky; shadow without a model switch; enforce through `krino/auto` or `prepareStep`;
      counterfactual cost and quality proxies (D25–D27).
    - ADR-024: `loadKrinoConfig()` and one config schema for runtime and CLI (D29).
    - ADR-025: Host-bound decision provider (Pi classifier) (D30).
    - ADR-026: Trace schema version 2 and price precedence (D31–D32).
  - **Shared docs:**
    - `03-contracts.md`: a "Changes approved in WP-16" list, like the WP-01 list.
    - `04-behavior-rules.md`: add the model-routing column or table and the bullets from
      section 5 of the plan.
    - `01-scope.md`: add a "v0.2 scope" section (Pi host, model routing, `@krinolabs/pi`,
      config loader) and its definition of done.
- **Acceptance:**
  - [ ] `pnpm turbo run lint typecheck test build` passes. Expected typecheck failures in other
        folders are fixed in this PR only where a type literal must list the new
        `DecisionKind` or `HostName` (for example a `Record<DecisionKind, …>`); list every such
        edit in the PR as a deviation, or leave a typed `TODO(WP-xx)` stub if the fix belongs to
        another WP.
  - [ ] Types compile; no `any`; descriptive names; `Array<Item>` syntax.
  - [ ] The stub runtime has tests for `decideModelRoute`.
  - [ ] Every new behavior rule names the WP that will test it.
  - [ ] The PR lists every deviation from section 4 of the plan.
- **After merge:** contracts are frozen again.

---

## 🚀 Kickoff prompt (paste into Claude Code, Codex, or Cursor)

```text
You are working on krino, a TypeScript decision layer for AI agents.
Read AGENTS.md, docs/plan/shared/03-contracts.md, docs/plan/shared/04-behavior-rules.md and
docs/plan/work-packages/pi-host-and-model-routing.md first.
Your task is WP-16 (Contracts v2 + ADRs), described in docs/plan/work-packages/wp-16-contracts-v2-adrs.md.
This WP is allowed to change packages/krino/src/contracts/**. Do only what it lists, write only
inside its "Owns" paths, and meet every acceptance criterion.
Work on branch wp-16-contracts-v2-adrs in its own git worktree. When done, run
`pnpm turbo run lint typecheck test build` and open a PR with: WP id, what you built, how you
tested it, versions you verified, open questions, and any deviation from the card.
```
