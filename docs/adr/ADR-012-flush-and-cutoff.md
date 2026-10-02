# ADR-012: Explicit flush() and cutOff status

## Status

Accepted (2026-10-02). Source: `docs/plan/architecture.md` section 5, decision D12.

## Context

Short CLI processes exit before background decision calls finish.

## Decision

`finishRun` and `flushAll` wait for pending decisions up to a timeout (default 2 s, `DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS`), then write the unfinished ones with status `cutOff`.

## Alternatives rejected

- Ignore unfinished calls (biases the data).

## Consequences

- Missing data stays visible; the report shows the cut-off count.
- Revisit default flush timeouts if the cut-off rate stays above 5%.
