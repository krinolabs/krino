# ADR-010: Redact content by default

## Status

Accepted (2026-10-02). Source: `docs/plan/architecture.md` section 5, decision D10.

## Context

Traces would otherwise hold prompts and tool data.

## Decision

`redactContent` defaults to `true`; no raw task text reaches a sink by default.

## Alternatives rejected

- Raw text by default.

## Consequences

- Less context when debugging; replay needs raw text. `redactContent: false` is opt-in.
- WP-04 tests that raw task text never appears in traces.
