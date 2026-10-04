# WP-07 · Claude Agent SDK adapter

> **Implemented differently; see [ADR-019](../../adr/ADR-019-agent-sdk-pruning-uses-disallowed-tools.md).**

> **Branch:** `wp-07-claude-agent-sdk-adapter`  |  **Status:** ✅ merged ([PR #10](https://github.com/krinolabs/krino/pull/10))
> **Read first:** [`AGENTS.md`](../../../AGENTS.md), [`03-contracts.md`](../shared/03-contracts.md), [`04-behavior-rules.md`](../shared/04-behavior-rules.md)
> **Before you open a PR:** [`05-review-checklist.md`](../shared/05-review-checklist.md)

- **Owner role:** Claude Code.
- **Depends on:** [WP-01](./wp-01-contracts.md) (stub runtime), [WP-02](./wp-02-core-runtime.md), [WP-03](./wp-03-decision-providers.md), [WP-04](./wp-04-file-trace-sink-redaction.md), [WP-08](./wp-08-risk-gate-policy.md) to finish.
- **Owns:** `packages/krino/src/adapters/claude-agent-sdk/**`.
- **Main model rule:** `RunSummaryTrace.modelIdentifier` = the `model` option passed to
  `query()`; if absent, the model with the most input tokens in the result's usage.
- **Run-start step rule:** Run start counts as `stepNumber: 0`: the run-start
  `decideToolSelection` call and its trace use `stepNumber: 0`. Risk checks from `PreToolUse`
  use `stepNumber` = the 1-based index of the tool call within the run, because the Agent SDK
  does not expose turns.
- **Deliverables:**
  - `krinoAgentOptions(queryOptions, krinoRuntime, taskText)` returns options for `query()`:
    - **Run start:** `decideToolSelection`; enforce mode sets `allowedTools` (merged with the user's list; never widens it).
    - Adds a `PreToolUse` hook that calls `checkToolCallRisk` (shadow: record only; never changes the hook's decision).
    - Preserves the user's existing hooks.
  - `observeKrinoMessages(messageStream, runHandle)`: reads `result` messages for total usage and cost; writes the run summary; calls `finishRun`.
  - Capabilities: `{ supportedDecisions: ['toolSelection', 'riskGate'], toolSelectionTiming: 'runStartOnly', reportsPerStepUsage: false }`.
  - Shadow agreement metric for this host: "all used tools are inside the suggested set", written in the run summary.
  - Never index a plain object with an external string (tool names, MCP data). Use a Map
    or check `Object.hasOwn` first. Test with `'constructor'`, `'toString'`, and `'__proto__'`.
- **Acceptance:**
  - [ ] Tests run without network (mock the SDK's message stream and hook calls).
  - [ ] Enforce mode never adds a tool the user did not allow.
  - [ ] User hooks still run, in their original order.
  - [ ] **Verify** hook names and signatures against the installed SDK version; record it in the PR.

---

## 🚀 Kickoff prompt (paste into Claude Code, Codex, or Cursor)

```text
You are working on krino, a TypeScript decision layer for AI agents.
Read AGENTS.md, docs/plan/shared/03-contracts.md and docs/plan/shared/04-behavior-rules.md first.
Your task is WP-07 (Claude Agent SDK adapter), described in docs/plan/work-packages/wp-07-claude-agent-sdk-adapter.md.
Do only what it lists, write only inside its "Owns" paths, and meet every acceptance criterion.
Work on branch wp-07-claude-agent-sdk-adapter. When done, run `pnpm turbo run lint typecheck test build`
and open a PR with: WP id, what you built, how you tested it, SDK versions you verified,
open questions, and any deviation from the card.
If you need a contract change, stop and explain it in the PR instead.
```
