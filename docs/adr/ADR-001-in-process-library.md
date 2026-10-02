# ADR-001: In-process library, not a proxy

## Status

Accepted (2026-10-02). Source: `docs/plan/architecture.md` section 5, decision D1.

## Context

krino has to see each step's context (task, available tools, recent messages) and must be able to pause a tool call before it runs. A network hop on every step would add latency and failure modes.

## Decision

krino ships as an in-process library that runs inside the agent's own process and talks to the host through adapters.

## Alternatives rejected

- HTTP proxy or gateway: it sees model requests, not the decisions inside a step.

## Consequences

- No network hop; full access to step context and host hooks.
- Only agents written in TypeScript can use it (see ADR-002). The trace format stays language-neutral so a later port can reuse the CLI.
