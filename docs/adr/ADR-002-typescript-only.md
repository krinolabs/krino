# ADR-002: TypeScript only (Node 22+)

## Status

Accepted (2026-10-02). Source: `docs/plan/architecture.md` section 5, decision D2.

## Context

An in-process library must run in the host's language. Both v0.1 hosts (Vercel AI SDK, Claude Agent SDK) are TypeScript.

## Decision

krino v0.1 is written in TypeScript, ESM only, for Node 22 and later.

## Alternatives rejected

- Go or Rust: would force a proxy (rejected in ADR-001).
- Python first: a smaller TypeScript audience for this owner.

## Consequences

- No support for Python or Go agents in v0.1.
- Revisit when there is real demand from Python users; a Python port can reuse the CLI and trace format.
