# ADR-015: @krinolabs/krino + @krinolabs/cli only

## Status

Accepted (2026-10-02). Source: `docs/plan/architecture.md` section 5, decision D15.

## Context

The CLI needs DuckDB's native binary; the user's app must not.

## Decision

Two published packages: the runtime library (`@krinolabs/krino`, with adapters at subpaths) and the CLI (`@krinolabs/cli`).

## Alternatives rejected

- One package.
- One package per adapter.

## Consequences

- Small runtime footprint; heavy analysis stays in the CLI.
- A bigger CLI install with possible platform issues; `krino doctor` checks them.
