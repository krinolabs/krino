# WP-28 · Docs, site, and v0.2.0 release

> **Branch:** `wp-28-docs-site-release-v0-2`  |  **Status:** ☐ not started
> **Read first:** [`AGENTS.md`](../../../AGENTS.md), [`03-contracts.md`](../shared/03-contracts.md), [`04-behavior-rules.md`](../shared/04-behavior-rules.md), [the v0.2 plan](./pi-host-and-model-routing.md), [WP-13](./wp-13-docs-release.md), [WP-15](./wp-15-site.md)
> **Before you open a PR:** [`05-review-checklist.md`](../shared/05-review-checklist.md)

- **Owner role:** Cursor for the docs and site; the lead for the plan docs and the release.
- **Depends on:** [WP-24](./wp-24-init-doctor-pi.md), [WP-26](./wp-26-bench-on-pi.md),
  [WP-27](./wp-27-e2e-pi.md).
- **Owns:** `README.md`, `packages/krino/README.md`, `packages/cli/README.md`,
  `packages/pi/README.md` (after WP-22 merges), `site/content/docs/**`, `site/src/docs-nav.ts`,
  `docs/src/**` and `docs/package.json` (snippet check), `docs/plan/architecture.md`,
  `docs/plan/release-checklist.md`, `docs/plan/live-verification.md`, `.changeset/**`.
  Lead only: `docs/plan/README.md`, `docs/plan/v0.2-backlog.md`.
- **Deliverables:**
  - **Root README:** Pi in the status line and the host table; a "Quick start: Pi" section
    (`pi install npm:@krinolabs/pi`, `krino.config.json`, `npx krino report`); a short
    "Model routing" section (shadow first, `krino/auto` on Pi, `withKrino` options on the AI
    SDK); updated limitations (risk gate shadow-only on Pi; routing quality is measured by
    proxy; Ctrl+C in Pi's print mode skips shutdown and leaves `cutOff` records). Every Pi SDK
    snippet uses the verified wiring: `session.bindExtensions({})`, and `krino.flushAll()` after
    `dispose()`.
  - **Package READMEs:** `@krinolabs/krino` gains the `./pi` entry point, `loadKrinoConfig`,
    and `modelRoutingPolicy`; `@krinolabs/cli` gains the routing report section and the new
    `init`/`doctor` checks; `@krinolabs/pi` gets a final pass.
  - **Site:** new pages `quick-start-pi.mdx` and `model-routing.mdx`; updates to
    `introduction`, `install`, `configuration` (the full `krino.config.json` schema), `cli`,
    `how-it-works`, `limitations`, and `benchmark` (Pi and routing results, with `[BENCH: …]`
    placeholders until the live run). Add the pages to `docs-nav.ts`.
  - **Snippet check:** the new README snippets compile in `docs/src/readme-snippets.test.ts`
    (add the Pi devDependencies to `docs/package.json`).
  - **Architecture:** add Pi and model routing to the big picture, components, runtime flows
    (a Pi sequence diagram and a routing sequence diagram), decisions D21–D32, trade-offs, and
    extension points.
  - **Live verification:** add rows for V5, V6, and V10 to `live-verification.md`, and a Pi
    section to the verification-day runbook steps in `release-checklist.md`.
  - **Release checklist:** a v0.2.0 section: publish order (`@krinolabs/krino` →
    `@krinolabs/cli` → `@krinolabs/pi`), provenance, and a clean-machine smoke test
    (`pi install npm:@krinolabs/pi@0.2.0`, one shadow prompt, `npx krino report`).
  - **Changesets:** minor bumps for `@krinolabs/krino` and `@krinolabs/cli`; `@krinolabs/pi`
    starts at 0.2.0 to line up with the others.
  - **Lead:** tracker rows for WP-16 to WP-28 in `docs/plan/README.md`; resolved and new rows
    in `v0.2-backlog.md` (risk-gate enforce on Pi, nested tool usage, Claude Agent SDK routing).
- **Acceptance:**
  - [ ] Every command and snippet in the docs was run or compiled (the snippet check passes).
  - [ ] The site builds, and the new pages appear in the navigation.
  - [ ] `[BENCH: …]` and `[VERIFY: …]` placeholders are listed in the PR, each with its owner.
  - [ ] Changesets exist for all three packages.

---

## 🚀 Kickoff prompt (paste into Claude Code, Codex, or Cursor)

```text
You are working on krino, a TypeScript decision layer for AI agents.
Read AGENTS.md, docs/plan/shared/03-contracts.md, docs/plan/shared/04-behavior-rules.md and
docs/plan/work-packages/pi-host-and-model-routing.md first.
Your task is WP-28 (Docs, site, and v0.2.0 release), described in
docs/plan/work-packages/wp-28-docs-site-release-v0-2.md.
Do only what it lists, write only inside its "Owns" paths, and meet every acceptance criterion.
Leave docs/plan/README.md and docs/plan/v0.2-backlog.md to the lead.
Work on branch wp-28-docs-site-release-v0-2 in its own git worktree. When done, run
`pnpm turbo run lint typecheck test build` and open a PR with: WP id, what you built, how you
tested it, versions you verified, open questions, and any deviation from the card.
```
