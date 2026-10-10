# ADR-024: The runtime reads krino.config.json through loadKrinoConfig

## Status

Accepted (2026-10-10). Source: the v0.2 plan, decision D29; the v0.2 backlog row
"`loadKrinoConfig()` so runtime and CLI share one config". Implemented in WP-18
(`packages/krino/src/config/`); the CLI moves to it in WP-24.

## Context

In v0.1 only the CLI reads `krino.config.json`. `createKrino()` takes an object, so users repeat
settings in code. Pi package users ([ADR-022](./ADR-022-third-package-krinolabs-pi.md)) write no
code at all, so the runtime must read a file.

## Decision

- `loadKrinoConfig()` in `@krinolabs/krino` reads and validates one `krino.config.json` and never
  throws. It returns the config without the `decisionProvider` and `traceSink` objects, plus a
  `decisionProviderSetting` that names the provider (`fake`, `jev-ai-gateway`, `pi-classifier`). The
  caller builds the provider.
- The caller passes the search order: `$KRINO_CONFIG`, then `<working directory>/krino.config.json`,
  then any extra paths (the Pi package adds a user-level file).
- One schema serves the runtime and the CLI (`krino init`, `krino doctor`).

## Alternatives rejected

- **Environment variables and flags only:** too many fields (policies, prices) for flat values.
- **A JavaScript config module:** it would execute code from the project folder, which raises trust
  questions that a JSON file does not.

## Consequences

- JSON cannot hold objects, so providers are named, not passed.
- Unknown fields are warnings, so older libraries can read newer files.
- Tool-name maps (`allowThresholdByToolName`) are built from own keys only.
