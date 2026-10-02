# ADR-016: Optional peer dependencies for host SDKs

## Status

Accepted (2026-10-02). Source: `docs/plan/architecture.md` section 5, decision D16.

## Context

Users run one host, not both.

## Decision

`ai` and `@anthropic-ai/claude-agent-sdk` are optional peer dependencies.

## Alternatives rejected

- Bundled host SDKs.

## Consequences

- Users install only their host.
- Users can install an untested host version; the docs state the tested range and `krino doctor` checks versions. Revisit on each host major release.
