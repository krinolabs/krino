# ADR-013: Contracts frozen after WP-01; stub runtime

## Status

Accepted (2026-10-02). Source: `docs/plan/architecture.md` section 5, decision D13.

## Context

Three to six agents build work packages in parallel against the same types.

## Decision

The contracts in `packages/krino/src/contracts/` are frozen after WP-01. A stub runtime lets adapters start before the core runtime merges.

## Alternatives rejected

- Evolving types during the build.

## Consequences

- Safe parallel work.
- Changes are slower: an agent that needs one stops and writes a contract change request in its PR; a change needs an ADR. Revisit in v0.2 planning.
