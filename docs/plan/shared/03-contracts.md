# 🧾 Contracts (written in WP-01, frozen after merge)

These types live in `packages/krino/src/contracts/`. Every other WP codes against them. WP-02 implements `KrinoRuntime`; adapters only call it.

## Source of truth

**The code in [`packages/krino/src/contracts/`](../../../packages/krino/src/contracts/) is the source of truth.** This page no longer copies the types. Type-level tests (`contracts.types.test.ts`) pin every exported type to its exact shape, so any drift fails `typecheck`.

| File | Holds |
|---|---|
| `decisions.ts` | `DecisionKind`, `DecisionMode`, `FailureRule`, `DecisionStatus`, `DecisionQuestion`, `DecisionAnswer` |
| `provider.ts` | `DecisionProvider`, `DecisionRequestOptions` |
| `host.ts` | `HostName`, `ToolSelectionTiming`, `HostCapabilities`, `ToolDescription`, `StepContext`, `PendingToolCall` |
| `trace.ts` | `TRACE_SCHEMA_VERSION`, `TokenUsageRecord`, `DecisionRecord` (with the choice encoding), `AgentStepTrace`, `RunSummaryTrace` |
| `sink.ts` | `TraceSink` |
| `config.ts` | `KrinoConfig`, `RiskGatePolicy`, `ModelPrice` |
| `runtime.ts` | `ToolSelectionOutcome`, `RiskGateVerdict`, `RiskGateOutcome`, `RunStartOptions`, `StepTraceInput`, `RunSummaryInput`, `RunHandle`, `KrinoRuntime`, `CreateKrino` |
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

> Contracts are frozen. An agent that needs a change stops and writes a "CONTRACT CHANGE REQUEST" in its PR description; an accepted change needs an ADR ([ADR-013](../../adr/ADR-013-frozen-contracts-and-stub-runtime.md)).
