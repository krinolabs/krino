# WP-18 · `loadKrinoConfig` (shared config file)

> **Branch:** `wp-18-config-loader`  |  **Status:** ☐ not started
> **Read first:** [`AGENTS.md`](../../../AGENTS.md), [`03-contracts.md`](../shared/03-contracts.md), [`04-behavior-rules.md`](../shared/04-behavior-rules.md), [the v0.2 plan](./pi-host-and-model-routing.md), ADR-024
> **Before you open a PR:** [`05-review-checklist.md`](../shared/05-review-checklist.md)

- **Owner role:** Codex.
- **Depends on:** [WP-16](./wp-16-contracts-v2-adrs.md).
- **Owns:** `packages/krino/src/config/**` (new).
- **Deliverables:**
  - `loadKrinoConfig(loadOptions)` reads one `krino.config.json` and returns either
    `{ loadKind: "loaded", krinoConfig, decisionProviderSetting, traceDirectory, configFilePath }`,
    `{ loadKind: "missing" }`, or `{ loadKind: "invalid", problems }`. It never throws.
    - `krinoConfig` is a `KrinoConfig` without `decisionProvider` and `traceSink` (those are
      objects; the caller builds them).
    - `decisionProviderSetting` is a tagged value: `{ providerName: "fake" }`,
      `{ providerName: "jev-ai-gateway", modelIdentifier? }`, or
      `{ providerName: "pi-classifier", classifierProvider?, classifierModelIdentifier? }`.
    - Search order (the caller passes the list; the loader takes the first file that exists):
      `$KRINO_CONFIG`, then `<working directory>/krino.config.json`, then any extra paths the
      caller adds (the Pi package adds a user-level file).
    - A relative `traceDirectory` resolves from the config file's folder.
  - A JSON schema as TypeScript (validated by hand, no new dependency) covering every field in
    the example below, including the three decision kinds and `modelRoutingPolicy`.
  - Unknown fields are warnings, not errors (forward compatible). Wrong types are errors with
    the field path, for example `modelRoutingPolicy.candidateModels[1].useWhen`.
  - `riskGatePolicy.allowThresholdByToolName` is built with own keys only. `__proto__`,
    `constructor`, and `toString` keys are kept as ordinary tool names, never as prototype
    changes.
  - Node `fs` stays in this folder (I/O at the edge). Inject `readFile` and `environment` for
    tests.
  - **Root export:** propose `loadKrinoConfig` and its types for `packages/krino/src/index.ts`
    in the PR (lead-owned file).

```json
{
  "projectName": "my-agent",
  "traceDirectory": "./traces",
  "decisionModes": { "toolSelection": "shadow", "riskGate": "shadow", "modelRouting": "shadow" },
  "decisionProvider": { "providerName": "pi-classifier" },
  "minimumConfidence": 0.8,
  "decisionTimeoutInMilliseconds": 800,
  "explorationRate": 0.05,
  "redactContent": true,
  "riskGatePolicy": {
    "blockedToolNames": [],
    "alwaysAllowedToolNames": ["read", "ls", "grep", "find"],
    "allowThresholdByToolName": { "bash": 0.9 }
  },
  "modelRoutingPolicy": {
    "candidateModels": [
      { "modelIdentifier": "anthropic/claude-sonnet-5-5", "useWhen": "Design work, changes across files, hard debugging" },
      { "modelIdentifier": "anthropic/claude-haiku-4-5", "useWhen": "Questions, small edits, running known commands" }
    ],
    "fallbackModelIdentifier": "anthropic/claude-sonnet-5-5"
  },
  "priceOverrides": []
}
```

- **Acceptance:**
  - [ ] Tests for: missing file, invalid JSON, wrong types (with field paths), unknown fields,
        relative trace folder, `$KRINO_CONFIG`, and the search order.
  - [ ] A config loaded from the example above passes `createKrino()` validation.
  - [ ] Keys `'constructor'`, `'toString'`, and `'__proto__'` in `allowThresholdByToolName`
        are handled as tool names.
  - [ ] The loader never throws (a property test with random JSON values).
  - [ ] No new dependencies.

---

## 🚀 Kickoff prompt (paste into Claude Code, Codex, or Cursor)

```text
You are working on krino, a TypeScript decision layer for AI agents.
Read AGENTS.md, docs/plan/shared/03-contracts.md, docs/plan/shared/04-behavior-rules.md and
docs/plan/work-packages/pi-host-and-model-routing.md first.
Your task is WP-18 (loadKrinoConfig), described in docs/plan/work-packages/wp-18-config-loader.md.
Do only what it lists, write only inside its "Owns" paths, and meet every acceptance criterion.
Work on branch wp-18-config-loader in its own git worktree. When done, run
`pnpm turbo run lint typecheck test build` and open a PR with: WP id, what you built, how you
tested it, versions you verified, open questions, and any deviation from the card.
If you need a contract change, stop and explain it in the PR instead.
```
