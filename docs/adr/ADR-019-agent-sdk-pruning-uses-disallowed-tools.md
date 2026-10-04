# ADR-019: Claude Agent SDK pruning uses disallowedTools

## Status

Accepted (2026-10-04). Source: WP-07 PR #10, section "allowedTools vs disallowedTools in SDK
0.3.286". Implemented in `packages/krino/src/adapters/claude-agent-sdk/`.

## Context

The WP-07 card said enforce mode "sets `allowedTools`". In `@anthropic-ai/claude-agent-sdk`
0.3.286, `allowedTools` controls auto-approval only: tools left out of it stay in the model's
prompt, so narrowing it saves no tokens, and adding a tool to it would auto-approve a call the
user never approved. The type comments in `sdk.d.ts` (`Options`) say so:

```ts
/**
 * List of tool names that are auto-allowed without prompting for permission.
 * These tools will execute automatically without asking the user for approval.
 * To restrict which tools are available, use the `tools` option instead.
 *
 * Note: passing `'Skill'` here is deprecated — use the `skills` option instead.
 */
allowedTools?: string[];

/**
 * List of tool names that are disallowed. These tools will be removed
 * from the model's context and cannot be used, even if they would
 * otherwise be allowed.
 */
disallowedTools?: string[];
```

The `tools` option sets the base set of built-in tools only, so it cannot prune MCP tools.

## Decision

krino changes tool availability, never approval. At run start in enforce mode,
`krinoAgentOptions` sets `disallowedTools` to the user's entries (unchanged, first) plus the
known tools it did not select. "Known tools" means the `toolDescriptions` passed to it, so krino
never disallows a tool it was not told about, such as a built-in tool. krino never reads or
changes `allowedTools` or `tools`. Shadow mode, a timeout, a failure, low confidence and
exploration samples leave the options unchanged.

## Alternatives rejected

- Narrowing `allowedTools`: changes approval, not availability. It saves no tokens and can
  auto-approve tools the user never approved.
- Setting `tools`: covers built-in tools only, which krino does not prune.

## Consequences

- Enforce mode can only remove tools; it can never widen what the user allowed or approved.
- Tools without a `toolDescriptions` entry are never pruned.
- The token saving rests on the type comment, not a measurement. The v0.2 backlog row "Measure
  the token saving of disallowedTools pruning on the Agent SDK path" confirms it.
- Revisit on each Agent SDK minor release, or if the SDK adds per-turn tool control
  (see [ADR-011](./ADR-011-host-capabilities.md)).
