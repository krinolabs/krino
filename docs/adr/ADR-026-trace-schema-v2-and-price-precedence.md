# ADR-026: Trace schema version 2 and price precedence

## Status

Accepted (2026-10-10). Source: the v0.2 plan, decisions D31–D32. Contracts and minimal reader
changes in WP-16; runtime in WP-17; full reporting in WP-23.

## Context

Model routing needs two new run-summary fields. Pi routes across many providers that the krino price
table does not list. The Pi catalog has prices for them, but it lists some paid models (such as the
Jev classifier) at 0.

## Decision

- `TRACE_SCHEMA_VERSION` becomes 2. Version 2 only adds fields: `RunSummaryTrace` gains
  `routingCounterfactualCostInUsd` (filled by the runtime) and `runOutcome` (from the adapter;
  optional in `RunSummaryInput`, `null` when the host does not say).
- `SUPPORTED_TRACE_SCHEMA_VERSIONS` (`[1, 2]`) tells readers which versions to accept. They read
  version 1 run summaries with the new fields as `null`, and count newer versions as unsupported.
- **Price precedence:** the user `priceOverrides`, then `RunStartOptions.hostModelPrices` (for
  example the Pi catalog), then `DEFAULT_MODEL_PRICES`. A host price whose input and output prices
  are both 0 counts as unknown and falls through to the krino table.
- A Pi step costs the matching user override when there is one, else the `usage.cost.total` that Pi
  reports.

## Alternatives rejected

- **Keep version 1 and add fields silently:** readers could not tell old records from new ones.
- **The krino price table only:** no prices for most models Pi users run.

## Consequences

- A v0.1 CLI counts version 2 lines as "unsupported schema version". Users upgrade the library and
  the CLI together (the changeset says so).
- The CLI reader accepts versions 1 and 2 from WP-16 on; WP-23 adds routing to the report.
