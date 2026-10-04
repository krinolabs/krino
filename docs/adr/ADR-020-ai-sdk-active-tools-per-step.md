# ADR-020: AI SDK activeTools applies per step

## Status

Accepted (2026-10-04). Source: WP-06 PR #11, section "Key finding: `activeTools` from
`prepareStep` lasts one step only". Implemented in `packages/krino/src/adapters/ai-sdk/`.

## Context

The WP-06 card said the adapter "returns `activeTools` on step 0". In `ai` 7.0.126
(`dist/index.js`, `generateText` and `streamText`), each step computes its tool list as:

```ts
filterActiveTools({ tools, activeTools: prepareStepResult?.activeTools ?? activeTools })
```

So an `activeTools` returned from `prepareStep` affects only that step. An `activeTools`
returned on step 0 alone falls back to every tool on step 1. The tool list then changes after
step 0, which breaks the prompt cache that [ADR-006](./ADR-006-tool-selection-step-zero-only.md)
protects.

## Decision

`withKrino` calls `decideToolSelection` once, with `stepNumber: 0`.

- Enforce mode locks the step-0 list and returns that same list as `activeTools` on every step.
- Shadow mode (and off) returns no `activeTools`, so the caller's setup is untouched.

The caller's `prepareStep` runs first on every step and its fields are kept. Its step-0
`activeTools` narrow the set krino selects from. After step 0 the caller's `activeTools` win,
and krino warns once per process that this breaks the prompt cache.

## Alternatives rejected

- Return `activeTools` on step 0 only (the card's wording): steps 1+ fall back to every tool
  and the cache breaks.

## Consequences

- The tool list is identical on every step of an enforced run, as ADR-006 requires. A test
  checks this on a 5-step run (`cache trap guard`).
- The adapter keeps the locked list per call (keyed by the SDK's `callId`).
- A caller that changes `activeTools` after step 0 can still break the cache; krino warns but
  does not override it.
- Revisit on each `ai` major release, in case `prepareStep` results start to persist.
