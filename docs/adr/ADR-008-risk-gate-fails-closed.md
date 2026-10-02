# ADR-008: The risk gate cannot fail open

## Status

Accepted (2026-10-02). Source: `docs/plan/architecture.md` section 5, decision D8.

## Context

A wrong "safe" verdict on a risky tool call costs more trust than an unneeded question.

## Decision

On timeout, error, low confidence or a missing threshold, the risk gate suggests `askHuman`. Block rules in code always win over the model. There is no setting to make it fail open.

## Alternatives rejected

- Configurable fail mode.

## Consequences

- More `askHuman` suggestions when the provider is unhealthy.
- The risk gate runs in shadow only in v0.1.
