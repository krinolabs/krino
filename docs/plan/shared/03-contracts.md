# 🧾 Contracts (written in WP-01, frozen after merge)

These types live in `packages/krino/src/contracts/`. Every other WP codes against them. WP-02 implements `KrinoRuntime`; adapters only call it.

## Source of truth

**The code in [`packages/krino/src/contracts/`](../../../packages/krino/src/contracts/) is the source of truth.** This page no longer copies the types. Type-level tests (`contracts.types.test.ts`) pin every exported type to its exact shape, so any drift fails `typecheck`.

| File | Holds |
|---|---|
| `decisions.ts` | `DecisionKind`, `DecisionMode`, `FailureRule`, `DecisionStatus`, `DecisionQuestion` (with `optionCriteria`), `DecisionAnswer` |
| `provider.ts` | `DecisionProvider`, `DecisionRequestOptions` |
| `host.ts` | `HostName`, `ToolSelectionTiming`, `HostCapabilities`, `ToolDescription`, `StepContext`, `PendingToolCall`, `ModelRouteContext` |
| `trace.ts` | `TRACE_SCHEMA_VERSION`, `TraceSchemaVersion`, `SUPPORTED_TRACE_SCHEMA_VERSIONS`, `TokenUsageRecord`, `DecisionRecord` (with the choice encoding), `AgentStepTrace`, `RunOutcome`, `RunSummaryTrace` |
| `sink.ts` | `TraceSink` |
| `config.ts` | `KrinoConfig`, `RiskGatePolicy`, `ModelCandidate`, `ModelRoutingPolicy`, `ModelPrice` |
| `runtime.ts` | `ToolSelectionOutcome`, `ModelRouteOutcome`, `RiskGateVerdict`, `RiskGateOutcome`, `RunStartOptions`, `StepTraceInput`, `RunSummaryInput`, `RunHandle`, `KrinoRuntime`, `CreateKrino` |
| `defaults.ts` | `KRINO_CONFIG_DEFAULTS`, cache multipliers, flush timeout, decision context budget, context safety margin |
| `errors.ts` | `KrinoConfigurationError`, `DecisionProviderError`, `DecisionTimeoutError` |
| `stub-runtime.ts` | `createStubKrino`: in-memory shadow-only `KrinoRuntime` for adapters until WP-02 merges (not re-exported from `index.ts`) |
| `index.ts` | Re-exports everything above except the stub runtime |

## Changes approved in WP-01

These differ from the original target signatures in this plan:

1. `export declare function createKrino` became `export type CreateKrino = (krinoConfig: KrinoConfig) => KrinoRuntime`. WP-02 implements `createKrino` in `core/`.
2. `AgentStepTrace` gained `recordType: 'agentStep'`, so `AgentStepTrace | RunSummaryTrace` is a discriminated union. `recordStep` input omits it.
3. Inline shapes became named types: `DecisionRequestOptions`, `RunStartOptions`, `StepTraceInput`, `RunSummaryInput`.
4. `RunSummaryTrace` gained `hostSdkVersion` and `modelIdentifier` (the main model of the run).
5. `RunSummaryTrace` gained `toolSelectionAgreement: boolean | null` for the per-run agreement metric.
6. `DecisionRecord` documents its choice encoding: for `toolSelection`, sorted tool names joined with `,`; for `riskGate`, a `RiskGateVerdict`.
7. `defaults.ts` adds `DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS` (2000), `DEFAULT_DECISION_CONTEXT_BUDGET_IN_TOKENS` (32000) and `DEFAULT_CONTEXT_SAFETY_MARGIN_RATIO` (0.1).

## Changes approved in WP-16 (v0.2)

These add the Pi host and model routing. Decisions: [ADR-021](../../adr/ADR-021-pi-host-adapter.md),
[ADR-022](../../adr/ADR-022-third-package-krinolabs-pi.md),
[ADR-023](../../adr/ADR-023-model-routing-decision-kind.md),
[ADR-024](../../adr/ADR-024-load-krino-config.md),
[ADR-025](../../adr/ADR-025-host-bound-decision-provider.md),
[ADR-026](../../adr/ADR-026-trace-schema-v2-and-price-precedence.md).

1. `DecisionKind` gains `"modelRouting"`. Model routing fails open to the policy's fallback model.
2. `DecisionQuestion` gains an optional `optionCriteria`: one line per option, sent as the option's
   criteria (model routing sends each candidate's `useWhen`).
3. `HostName` gains `"pi"`.
4. New `ModelRouteContext` (`host.ts`): the step-0 context, the host's model, the candidates the host
   can use now, and `canApplyRoute`.
5. New `ModelCandidate` and `ModelRoutingPolicy` (`config.ts`); `KrinoConfig` gains
   `modelRoutingPolicy`. `ModelCandidate` lives in `config.ts`, not `host.ts`, because only the
   config uses it.
6. New `ModelRouteOutcome`; `RunHandle` gains `decideModelRoute`.
7. `RunStartOptions` gains an optional `hostModelPrices` (used after `priceOverrides`, before
   krino's own table).
8. `TRACE_SCHEMA_VERSION` becomes 2. New `TraceSchemaVersion` and `SUPPORTED_TRACE_SCHEMA_VERSIONS`
   (`[1, 2]`) for readers.
9. `RunSummaryTrace` gains `routingCounterfactualCostInUsd` and `runOutcome` (new `RunOutcome`).
   `RunSummaryInput` omits `routingCounterfactualCostInUsd` (the runtime fills it) and makes
   `runOutcome` optional (default `null`), so v0.1 adapters keep compiling.
10. `KRINO_CONFIG_DEFAULTS.decisionModes.modelRouting` is `"shadow"`, like every decision kind. It
    does nothing without a `modelRoutingPolicy`.
11. The stub runtime gains `decideModelRoute` (keeps the host's model) and `modelRouteRequests`.

> Contracts are frozen. An agent that needs a change stops and writes a "CONTRACT CHANGE REQUEST" in its PR description; an accepted change needs an ADR ([ADR-013](../../adr/ADR-013-frozen-contracts-and-stub-runtime.md)).
