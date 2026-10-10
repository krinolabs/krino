# ADR-023: Model routing is a decision kind that fails open to a fallback model

## Status

Accepted (2026-10-10). Source: the v0.2 plan, decisions D25–D27. Contracts in WP-16; runtime in
WP-17; hosts in WP-20 (Pi) and WP-21 (Vercel AI SDK).

## Context

Many agent runs do not need the strongest model. A small decision model can suggest a cheaper one
per run. Two hosts expose a per-request model choice: Pi through virtual models
(`pi.registerVirtualModel()`, whose `route()` runs before every request), and the Vercel AI SDK
through the `model` that `prepareStep` returns. Switching models inside a run loses the prompt
cache, and a cheaper model can fail on hard work. Shadow data can show the cost saving, but not
whether the cheaper model would have succeeded.

## Decision

- `DecisionKind` gains `"modelRouting"`. The user lists 2–4 candidates in
  `KrinoConfig.modelRoutingPolicy`, each with a one-line `useWhen`, and names one as the fallback.
- The runtime asks one choice question over the candidates the host can use now
  (`ModelRouteContext.availableCandidateIdentifiers`), sending each `useWhen` as the option's
  criteria (`DecisionQuestion.optionCriteria`). It uses `minimumConfidence`, like tool selection.
- **Fail open to the fallback model** on a timeout, an error, low confidence, an answer that names
  no available candidate, a context over budget, and exploration samples.
- **Decide once per run, on its first request.** Tool follow-ups, retries, steering, and follow-up
  messages in the same run keep that model. Requests outside the agent loop (Pi `reason: "direct"`,
  such as compaction summaries) use the fallback and are not decisions.
- **Shadow never changes the model.** On Pi, shadow observes in `before_agent_start` whatever model
  is selected (`canApplyRoute: false`). Enforce needs the `krino/auto` virtual model on Pi, or the
  routing options of `withKrino` on the AI SDK, which return the routed `model` on every step.
  Enforce with `canApplyRoute: false`, or without an available fallback, records
  `skippedUnsupported`.
- **Measurement:** the run summary records `routingCounterfactualCostInUsd` (the run's usage priced
  at the suggested model in shadow, or at the fallback in enforce) and `runOutcome`. The report
  compares routed runs with fallback and exploration runs (steps, errors, aborts) as quality
  proxies.
- **Default mode:** `shadow`, like every decision kind; without a `modelRoutingPolicy` it does
  nothing. `enforce` without a policy is a `KrinoConfigurationError`.
- The Claude Agent SDK does not support model routing; its adapter does not declare it.

## Alternatives rejected

- **Route on every request:** each switch loses the prompt cache.
- **Fail to the cheapest model:** a wrong "cheap is enough" costs quality, and the user cannot see
  it.
- **Shadow only through `krino/auto`:** users would have to change their model before seeing any
  data.
- **Model routing on the Claude Agent SDK:** it has no per-request model control.

## Consequences

- The counterfactual cost is an estimate: another model uses other token counts and may take more
  turns. Reports label it as such.
- Quality is measured by proxy only; enforce stays opt-in.
- Enforce adds up to the decision timeout before the first token of each run.
