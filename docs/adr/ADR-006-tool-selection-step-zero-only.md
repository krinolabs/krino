# ADR-006: Tool selection only at step 0 / run start

## Status

Accepted (2026-10-02). Source: `docs/plan/architecture.md` section 5, decision D6.

## Context

Changing the tool list mid-conversation invalidates the prompt cache for the whole conversation, which costs more than pruning saves.

## Decision

In enforce mode, tool selection changes the tool list only on step 0 (AI SDK) or at run start (Claude Agent SDK). Later steps keep the same list.

## Alternatives rejected

- Per-step pruning (kept only in the bench, to prove the cache trap).

## Consequences

- Cache-safe by construction.
- Smaller savings than per-step pruning; tasks that need new tools later get no benefit.
- Revisit if the bench shows step-0 pruning saves too little, or when Anthropic deferred-tool loading is verified.
