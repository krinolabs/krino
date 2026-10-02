# ADR-011: Each adapter declares HostCapabilities

## Status

Accepted (2026-10-02). Source: `docs/plan/architecture.md` section 5, decision D11.

## Context

Hosts expose different control points (per-step loop vs. run-start options and hooks).

## Decision

Each adapter passes `HostCapabilities` to `startRun`: supported decisions, tool-selection timing (`perStep` or `runStartOnly`), and whether usage is reported per step.

## Alternatives rejected

- A lowest-common-denominator API.

## Consequences

- Each host gets the best control it offers; decisions a host cannot apply are recorded as `skippedUnsupported`.
- Metrics differ per host (Agent SDK agreement is per run) and are labeled per host in reports.
