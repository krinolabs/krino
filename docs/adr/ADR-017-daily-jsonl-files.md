# ADR-017: Daily JSONL files, rotate at 50 MB

## Status

Accepted (2026-10-02). Source: `docs/plan/architecture.md` section 5, decision D17.

## Context

Trace files must be simple to append to, read and delete.

## Decision

The file sink writes one JSONL file per day and rotates it at 50 MB.

## Alternatives rejected

- One file per run.
- One big file.

## Consequences

- Simple, appendable, easy to delete; the directory can be set with `KRINO_TRACE_DIRECTORY`.
- Disk use grows until files are deleted.
