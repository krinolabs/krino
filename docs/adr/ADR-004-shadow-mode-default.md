# ADR-004: Shadow mode is the default

## Status

Accepted (2026-10-02). Source: `docs/plan/architecture.md` section 5, decision D4.

## Context

Teams will not let a new library change their agent's behavior before they have seen what it would do.

## Decision

Every decision kind defaults to `shadow`: krino asks, records the suggestion, and changes nothing. `enforce` is opt-in.

## Alternatives rejected

- Enforce by default.

## Consequences

- Zero-risk adoption, and free counterfactual data for the report.
- Shadow decisions still cost money (about $0.0003 per decision on an 8K-token state, own estimate). The report shows that spend.
