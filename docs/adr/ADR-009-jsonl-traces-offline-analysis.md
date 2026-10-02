# ADR-009: JSONL traces; analysis offline in the CLI

## Status

Accepted (2026-10-02). Source: `docs/plan/architecture.md` section 5, decision D9.

## Context

Users need cost and agreement reports, but should not run a database inside their app.

## Decision

The runtime appends JSONL trace lines. The separate CLI analyzes them offline with DuckDB.

## Alternatives rejected

- SQLite in-process.
- A hosted backend.

## Consequences

- No database in the user's app; reports can be rerun.
- Local files are lost on serverless and give no cross-machine view; console and OpenTelemetry sinks come later.
- The DuckDB native binary lives in the CLI (see ADR-015).
