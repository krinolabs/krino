---
"@krinolabs/krino": minor
"@krinolabs/cli": patch
---

Contracts for the Pi host and model routing (ADR-021 to ADR-026).

- New decision kind `modelRouting`, with `ModelRoutingPolicy`, `ModelCandidate`,
  `ModelRouteContext`, `ModelRouteOutcome` and `RunHandle.decideModelRoute`. In this release the
  runtime keeps the host's model; routing itself comes later.
- New host name `"pi"`, `DecisionQuestion.optionCriteria`, and `RunStartOptions.hostModelPrices`.
- Traces use schema version 2: run summaries carry `routingCounterfactualCostInUsd` and
  `runOutcome`. `SUPPORTED_TRACE_SCHEMA_VERSIONS` lists the versions trace readers accept.
- `@krinolabs/cli` reads trace schema versions 1 and 2. Use the CLI release that matches the
  library: it is the one that reads the traces the library writes.
