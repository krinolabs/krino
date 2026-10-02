# ADR-005: Shadow calls run in the background

## Status

Accepted (2026-10-02). Source: `docs/plan/architecture.md` section 5, decision D5.

## Context

Shadow mode must not slow the agent down.

## Decision

In shadow mode the runtime starts the provider call and returns at once. The answer is recorded when it arrives.

## Alternatives rejected

- Awaiting shadow calls.

## Consequences

- 0 ms added to the agent's path (WP-02 tests this with a provider that takes 5 s).
- Short processes can exit before answers arrive; see ADR-012.
