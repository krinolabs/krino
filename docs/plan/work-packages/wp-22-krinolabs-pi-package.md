# WP-22 · `@krinolabs/pi` Pi package

> **Branch:** `wp-22-krinolabs-pi-package`  |  **Status:** ☐ not started
> **Read first:** [`AGENTS.md`](../../../AGENTS.md), [`03-contracts.md`](../shared/03-contracts.md), [`04-behavior-rules.md`](../shared/04-behavior-rules.md), [the v0.2 plan](./pi-host-and-model-routing.md), ADR-022, ADR-024
> **Before you open a PR:** [`05-review-checklist.md`](../shared/05-review-checklist.md)

- **Owner role:** Claude Code.
- **Depends on:** [WP-18](./wp-18-config-loader.md), [WP-19](./wp-19-providers-routing-pi-classifier.md),
  [WP-20](./wp-20-pi-adapter.md).
- **Owns:** `packages/pi/**` (new; the `packages/*` workspace glob already includes it).
- **Deliverables:**
  - `package.json` for a public Pi package:
    - `name: "@krinolabs/pi"`, `type: "module"`, `engines.node: ">=22.19"` (Pi's floor),
      `keywords: ["pi-package", …]`, `pi: { "extensions": ["./dist/extension.js"] }`,
      `publishConfig: { access: "public", provenance: true }`.
    - `dependencies`: `@krinolabs/krino` (workspace, published as an exact range) and `ai` (for
      the optional AI Gateway provider, loaded with `import()` only when configured; ADR-022
      open question).
    - `peerDependencies`: `@earendil-works/pi-coding-agent: "*"` and
      `@earendil-works/pi-ai: "*"`, never bundled (Pi's package rules). Pinned devDependencies
      for tests.
  - `src/extension.ts`, the default export. On the first `session_start`:
    1. `loadKrinoConfig()` with this search order: `$KRINO_CONFIG`,
       `<ctx.cwd>/krino.config.json`, `~/.pi/agent/krino.config.json`.
    2. No file: defaults. `projectName` = the working folder's name; every decision in shadow;
       provider `pi-classifier`; no routing.
    3. Invalid file: warn with the problems and run with the defaults (fail open; never stop Pi).
    4. Build the provider by name. `pi-classifier`: find the classifier with
       `ctx.modelRegistry.findOfType("classifier", …)` (default `typesafe/jev-latest`); if it is
       missing or has no credentials, warn once and use the fake provider. `jev-ai-gateway`:
       `import("@krinolabs/krino/providers/jev")`. `fake`: the fake provider.
    5. `createKrino(...)`, then hand everything to `createKrinoPiExtension`.
  - The factory itself starts no timers, files, or network calls (Pi loads extensions without a
    session sometimes).
  - `README.md`: `pi install npm:@krinolabs/pi`, trying it once with `pi -e npm:@krinolabs/pi`,
    the config file, the classifier key, `krino/auto`, `/krino`, and `npx krino report`.
  - **Verify** (plan V9): install the packed tarball with `pi install ./krinolabs-pi-*.tgz` (or
    a local path) in a scratch Pi setup with `PI_CODING_AGENT_DIR` pointing at a temp folder (so
    `~/.pi` is untouched). Record warnings and the Pi version in the PR. Also check V8 from the
    compiled package: `VERSION` from `@earendil-works/pi-coding-agent` must resolve to the
    running Pi's copy, not a physical copy under `node_modules`.
- **Acceptance:**
  - [ ] Tests load the extension into a fake `ExtensionAPI` and cover: no config, valid config,
        invalid config, missing classifier, each provider name.
  - [ ] `npm pack --dry-run` lists only `dist/`, `README.md`, `LICENSE`, and `package.json`;
        the manifest has the `pi` key and the `pi-package` keyword.
  - [ ] No Pi package appears in `dependencies` (Pi warns about that).
  - [ ] A changeset for the first release of `@krinolabs/pi`.

---

## 🚀 Kickoff prompt (paste into Claude Code, Codex, or Cursor)

```text
You are working on krino, a TypeScript decision layer for AI agents.
Read AGENTS.md, docs/plan/shared/03-contracts.md, docs/plan/shared/04-behavior-rules.md and
docs/plan/work-packages/pi-host-and-model-routing.md first.
Your task is WP-22 (@krinolabs/pi Pi package), described in docs/plan/work-packages/wp-22-krinolabs-pi-package.md.
Do only what it lists, write only inside its "Owns" paths, and meet every acceptance criterion.
Work on branch wp-22-krinolabs-pi-package in its own git worktree. When done, run
`pnpm turbo run lint typecheck test build` and open a PR with: WP id, what you built, how you
tested it, Pi versions you verified, open questions, and any deviation from the card.
If you need a contract change, stop and explain it in the PR instead.
```
