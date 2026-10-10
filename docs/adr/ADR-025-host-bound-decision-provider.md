# ADR-025: A host-bound decision provider uses Pi's own classifier

## Status

Accepted (2026-10-10). Source: the v0.2 plan, decision D30; the Pi 1.1.0 verification run
([`pi-verification-1.1.0.md`](../plan/pi-verification-1.1.0.md), V5).
Implemented in WP-19 (`packages/krino/src/providers/pi-classifier/`).

## Context

The Pi model registry can call structured classifiers (`ctx.modelRegistry.classify()`), and Pi
ships the TypeSafe Jev classifier as `typesafe/jev-latest`. The v0.1 Jev provider goes through
Vercel AI Gateway and needs a second key. Verified against Pi 1.1.0:

- The Pi catalog prices `typesafe/jev-latest` at 0, so `usage.cost.total` from the classifier is
  always 0.
- `classify` has no default timeout, and `maxRetries` defaults to 2.
- Credentials come from the Pi auth store (`/login`) first, then `TYPESAFE_API_KEY`.
  `ctx.modelRegistry.getAvailableOfType("classifier", "typesafe")` lists classifiers with working
  credentials.

## Decision

- `createPiClassifierProvider()` wraps a structural `classify` client taken from
  `ctx.modelRegistry`, with `typesafe/jev-latest` as the default model. It uses type-only Pi
  imports and is exported only from `@krinolabs/krino/pi`.
- Questions map to Pi classifier questions: yes/no → `bool`, options → `choice` with
  `optionCriteria` as the criteria. Stop reasons `error` and `aborted` become
  `DecisionProviderError` and `DecisionTimeoutError`.
- The provider calls `classify` with `{ signal, timeoutMs, maxRetries: 0 }`: a decision has a short
  deadline.
- Decision cost comes from the krino price table for Jev, using the token counts in the result when
  present, because the Pi catalog price is 0.
- Availability is checked with `getAvailableOfType("classifier", "typesafe")`. Without a working
  classifier, the Pi package warns once and uses the fake provider.

## Alternatives rejected

- **Jev through AI Gateway only:** a second key and a second bill for Pi users, and `ai` as a hard
  dependency of the Pi package.

## Consequences

- The provider needs a Pi session context, so the runtime is built lazily, on the first session
  event.
- Credentials stay with Pi; krino never reads them.
- If the Pi catalog starts pricing Jev, revisit the cost source.
