# ADR-003: Ports and adapters

## Status

Accepted (2026-10-02). Source: `docs/plan/architecture.md` section 5, decision D3.

## Context

The hosts and the Jev decision model are new and change often. That churn should stay at the edges, not in the decision logic.

## Decision

The core depends only on ports (`DecisionProvider`, `TraceSink`, prices). Host adapters, providers and sinks live at the edges. `contracts/` imports nothing; `core/` and `risk-gate/` import only `contracts/`; adapters never import each other; the root entry point never imports a host SDK or `ai`.

## Alternatives rejected

- One adapter-specific codebase per host.

## Consequences

- A new provider, sink or host is one new folder; the core does not change.
- The dependency rules must be enforced (WP-14 checks the root import).
