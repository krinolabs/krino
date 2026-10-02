# ADR-007: Failure rules live in the core

## Status

Accepted (2026-10-02). Source: `docs/plan/architecture.md` section 5, decision D7.

## Context

Every host must get the same safety behavior when a provider times out, fails, or is not confident.

## Decision

Fail-open (tool selection) and fail-closed (risk gate) rules are implemented once, in the core. They are binding in `docs/plan/shared/04-behavior-rules.md`.

## Alternatives rejected

- Per-adapter failure rules.

## Consequences

- No adapter can weaken the rules.
- Every row of the behavior table needs a test in the core (WP-02).
