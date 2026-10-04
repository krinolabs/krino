# WP-06 · Vercel AI SDK adapter

> **Implemented differently; see [ADR-020](../../adr/ADR-020-ai-sdk-active-tools-per-step.md).**

> **Branch:** `wp-06-vercel-ai-sdk-adapter`  |  **Status:** ☐ not started
> **Read first:** [`AGENTS.md`](../../../AGENTS.md), [`03-contracts.md`](../shared/03-contracts.md), [`04-behavior-rules.md`](../shared/04-behavior-rules.md)
> **Before you open a PR:** [`05-review-checklist.md`](../shared/05-review-checklist.md)

- **Owner role:** Claude Code.
- **Depends on:** [WP-01](./wp-01-contracts.md) (start with the stub runtime), [WP-02](./wp-02-core-runtime.md), [WP-03](./wp-03-decision-providers.md), [WP-04](./wp-04-file-trace-sink-redaction.md), [WP-08](./wp-08-risk-gate-policy.md) to finish.
- **Owns:** `packages/krino/src/adapters/ai-sdk/**`.
- **Deliverables:**
  - `withKrino(generateTextOptions, krinoRuntime)` returns options for `generateText` / `streamText`:
    - Composes with a user's existing `prepareStep` (never drops it).
    - **Step 0:** `decideToolSelection`; in enforce mode returns `activeTools`; later steps never change `activeTools`.
    - Wraps each tool's `execute` to call `checkToolCallRisk` (shadow: record only, then run the original).
    - Reads per-step usage, including Anthropic cache tokens from provider metadata. **Verify the metadata keys for your AI SDK version.**
    - Calls `finishRun` when the run ends (success, error, or abort).
  - Capabilities: `{ supportedDecisions: ['toolSelection', 'riskGate'], toolSelectionTiming: 'perStep', reportsPerStepUsage: true }`.
  - Never index a plain object with an external string (tool names, MCP data). Use a Map
    or check `Object.hasOwn` first. Test with `'constructor'`, `'toString'`, and `'__proto__'`.
- **Acceptance:**
  - [ ] Tests with the AI SDK mock language model (no network): shadow sends all tools; enforce sends the selected tools on step 0 only.
  - [ ] Cache trap guard test: across a 5-step run in enforce mode, the tool list is identical on steps 1–4.
  - [ ] A user `prepareStep` still runs and its result is merged.
  - [ ] An abort or thrown error still writes a run summary.

---

## 🚀 Kickoff prompt (paste into Claude Code, Codex, or Cursor)

```text
You are working on krino, a TypeScript decision layer for AI agents.
Read AGENTS.md, docs/plan/shared/03-contracts.md and docs/plan/shared/04-behavior-rules.md first.
Your task is WP-06 (Vercel AI SDK adapter), described in docs/plan/work-packages/wp-06-vercel-ai-sdk-adapter.md.
Do only what it lists, write only inside its "Owns" paths, and meet every acceptance criterion.
Work on branch wp-06-vercel-ai-sdk-adapter. When done, run `pnpm turbo run lint typecheck test build`
and open a PR with: WP id, what you built, how you tested it, SDK versions you verified,
open questions, and any deviation from the card.
If you need a contract change, stop and explain it in the PR instead.
```
