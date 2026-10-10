# WP-25 · Example: `examples/pi-cli`

> **Branch:** `wp-25-pi-example`  |  **Status:** ☐ not started
> **Read first:** [`AGENTS.md`](../../../AGENTS.md), [`03-contracts.md`](../shared/03-contracts.md), [`04-behavior-rules.md`](../shared/04-behavior-rules.md), [the v0.2 plan](./pi-host-and-model-routing.md), [WP-12](./wp-12-examples.md)
> **Before you open a PR:** [`05-review-checklist.md`](../shared/05-review-checklist.md)

- **Owner role:** Cursor.
- **Depends on:** [WP-20](./wp-20-pi-adapter.md) (and WP-19 for the Pi classifier).
- **Owns:** `examples/pi-cli/**` (new, private).
- **Deliverables:**
  - The same log-triage agent as `examples/ai-sdk-cli` and `examples/claude-agent-sdk-cli`,
    embedded with the Pi SDK: `createAgentSession` with `SessionManager.inMemory()`, the
    log-triage tools registered as Pi tools (TypeBox schemas), and `createKrinoPiExtension` as
    an inline extension factory.
  - A routing policy with two candidates and a fallback, so the run shows a routing decision.
  - **`--fake`**: no key, no network. A scripted Pi model (verify what Pi offers for tests,
    for example a faux provider in `@earendil-works/pi-ai`; else register a scripted provider
    with `pi.registerProvider`) plus krino's fake decision provider.
  - **Live** (behind `KRINO_LIVE=1`): the user's Pi credentials, the Pi classifier, and a real
    model.
  - Tasks and risk policy reused from the other examples where possible (import, don't copy).
  - `README.md`: what it shows, how to run both modes, and `npx krino report`.
- **Acceptance:**
  - [ ] `--fake` runs end to end in CI, writes `pi` traces with tool-selection, risk-gate, and
        model-routing decisions, and `krino report --json` reads them (test).
  - [ ] Two prompts in one session show the session tool lock (one tool-selection decision,
        two runs).
  - [ ] No network in tests; no real prompts in fixtures.
  - [ ] Never writes to `~` during tests (trace folder from `KRINO_TRACE_DIRECTORY`).

---

## 🚀 Kickoff prompt (paste into Claude Code, Codex, or Cursor)

```text
You are working on krino, a TypeScript decision layer for AI agents.
Read AGENTS.md, docs/plan/shared/03-contracts.md, docs/plan/shared/04-behavior-rules.md and
docs/plan/work-packages/pi-host-and-model-routing.md first.
Your task is WP-25 (Example: examples/pi-cli), described in docs/plan/work-packages/wp-25-pi-example.md.
Do only what it lists, write only inside its "Owns" paths, and meet every acceptance criterion.
Work on branch wp-25-pi-example in its own git worktree. When done, run
`pnpm turbo run lint typecheck test build` and open a PR with: WP id, what you built, how you
tested it, Pi versions you verified, open questions, and any deviation from the card.
If you need a contract change, stop and explain it in the PR instead.
```
