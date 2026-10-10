# WP-24 · `krino init` + `krino doctor` for Pi

> **Branch:** `wp-24-init-doctor-pi`  |  **Status:** ☐ not started
> **Read first:** [`AGENTS.md`](../../../AGENTS.md), [`03-contracts.md`](../shared/03-contracts.md), [`04-behavior-rules.md`](../shared/04-behavior-rules.md), [the v0.2 plan](./pi-host-and-model-routing.md), ADR-024
> **Before you open a PR:** [`05-review-checklist.md`](../shared/05-review-checklist.md)

- **Owner role:** Codex.
- **Depends on:** [WP-18](./wp-18-config-loader.md), [WP-22](./wp-22-krinolabs-pi-package.md).
- **Owns:** `packages/cli/src/commands/init*`, `packages/cli/src/commands/doctor*`,
  `packages/cli/src/commands/__snapshots__/{init,doctor}*`.
- **Deliverables:**
  - **One config schema:** `init` writes and `doctor` reads `krino.config.json` through
    `loadKrinoConfig` and its types (WP-18). Remove the CLI's own parser. Update
    `KRINO_CONFIG_DESCRIPTION`: the runtime now reads this file.
  - **`krino init`:**
    - Detects Pi: `@earendil-works/pi-coding-agent` in `package.json`, or a `.pi/` folder in
      the project.
    - Writes all three decision kinds (`modelRouting: "shadow"`, which has an effect only with
      a policy) and `decisionProvider: { "providerName": "pi-classifier" }` for Pi projects.
    - `--routing <fallback>,<model>[,<model>…]` writes a `modelRoutingPolicy` with those
      candidates (the first is the fallback) and placeholder `useWhen` lines, and prints a
      reminder to edit them. Without the flag, no policy is written (routing stays off).
    - Prints `pi install npm:@krinolabs/pi` for CLI users, and for embedders the SDK snippet
      from the WP-20 card: `createKrinoPiExtension` in `DefaultResourceLoader`,
      `session.bindExtensions({})`, and `krino.flushAll()` after `dispose()`.
  - **`krino doctor`:**
    - Pi version inside the tested range (`>=1.1.0 <2`), from the project's
      `node_modules`, else from `pi --version` when `pi` is on `PATH` (time-limited).
    - `@krinolabs/pi` listed in `~/.pi/agent/settings.json` or `.pi/settings.json`
      `packages` (read as JSON; never print other settings).
    - Classifier credentials: Pi checks its auth store (`/login`) first, then `TYPESAFE_API_KEY`
      (verified, V5). Doctor never reads Pi's credential files, so a missing variable is an
      **info** line ("not in the environment; fine if you ran `/login` in Pi"), never a warning.
      Only check that the variable exists.
    - Model routing: the policy validates; the fallback is one of the candidates; candidate
      prices are known to krino or will come from the Pi catalog at run time (info, not a
      warning).
    - Trace scan: shows `pi` traces and schema v2 records.
    - Every warning has a fix, as in v0.1.
- **Acceptance:**
  - [ ] Snapshot tests for `init` in an AI SDK, Claude Agent SDK, and Pi project, and with
        `--routing`; a bad `--routing` value (one model, duplicates) fails with a fix.
  - [ ] `doctor` tests with a fake file system and a fake `pi --version`, including a missing
        `pi` binary and a timeout.
  - [ ] Never prints secrets or other settings values (a test plants a fake key and checks
        the output).
  - [ ] Package names in `settings.json` such as `'constructor'` and `'__proto__'` are read
        safely.

---

## 🚀 Kickoff prompt (paste into Claude Code, Codex, or Cursor)

```text
You are working on krino, a TypeScript decision layer for AI agents.
Read AGENTS.md, docs/plan/shared/03-contracts.md, docs/plan/shared/04-behavior-rules.md and
docs/plan/work-packages/pi-host-and-model-routing.md first.
Your task is WP-24 (krino init + krino doctor for Pi), described in docs/plan/work-packages/wp-24-init-doctor-pi.md.
Do only what it lists, write only inside its "Owns" paths, and meet every acceptance criterion.
Work on branch wp-24-init-doctor-pi in its own git worktree. When done, run
`pnpm turbo run lint typecheck test build` and open a PR with: WP id, what you built, how you
tested it, versions you verified, open questions, and any deviation from the card.
If you need a contract change, stop and explain it in the PR instead.
```
