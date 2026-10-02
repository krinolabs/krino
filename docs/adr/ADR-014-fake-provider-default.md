# ADR-014: Fake provider is the default; Jev at its own import path

## Status

Accepted (2026-10-02). Source: `docs/plan/architecture.md` section 5, decision D14.

## Context

Tests must run without network, and the root package must not import `ai`.

## Decision

The fake provider is the default decision provider. The Jev provider lives at `@krinolabs/krino/providers/jev`.

## Alternatives rejected

- Jev as a hard dependency.

## Consequences

- Fast, free tests with no API cost in CI.
- Risk of a silent no-op setup: krino warns at startup and `krino doctor` flags it.
