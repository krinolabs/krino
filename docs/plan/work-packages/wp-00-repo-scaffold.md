# WP-00 · Repo scaffold

> **Branch:** `wp-00-repo-scaffold`  |  **Status:** ✅ merged ([PR #1](https://github.com/krinolabs/krino/pull/1))
> **Read first:** [`AGENTS.md`](../../../AGENTS.md), [`03-contracts.md`](../shared/03-contracts.md), [`04-behavior-rules.md`](../shared/04-behavior-rules.md)
> **Before you open a PR:** [`05-review-checklist.md`](../shared/05-review-checklist.md)

- **Owner role:** lead (or one agent).
- **Depends on:** nothing.
- **Owns (write):** root config files, `.github/workflows/`, `packages/*/package.json`, `packages/*/tsconfig.json`, empty `src/index.ts` files, `AGENTS.md`, `CLAUDE.md`, `bench/`, `examples/*`, `e2e/`, `.changeset/`, `README.md`, `LICENSE`, `docs/` (one-time move into `docs/plan/`).
- **Deliverables:**
  - pnpm workspace + Turborepo (`build`, `typecheck`, `test`, `lint` tasks).
  - `tsconfig.base.json`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, ES2022, NodeNext modules.
  - tsup builds (ESM + `.d.ts`) for both packages; core exports map from `shared/02-repo-layout.md`.
  - Vitest in each package; Biome for lint + format.
  - Changesets initialized.
  - `ci.yml`: install, `turbo run lint typecheck test build` on Node 22 and 24. No secrets.
  - `release.yml`: Changesets action; publish with `--provenance --access public`.
  - `engines.node: ">=22"`; `"type": "module"`; `"license": "MIT"`.
- **Acceptance:**
  - [ ] `pnpm install && pnpm turbo run lint typecheck test build` passes on a clean clone.
  - [ ] `npm pack` for `@krinolabs/krino` contains only `dist/`, `README.md`, `LICENSE`, `package.json`.
  - [ ] CI passes on the PR.
- **Out of scope:** any runtime code.

---

## 🚀 Kickoff prompt (paste into Claude Code, Codex, or Cursor)

```text
You are working on krino, a TypeScript decision layer for AI agents.
Read AGENTS.md, docs/plan/shared/03-contracts.md and docs/plan/shared/04-behavior-rules.md first.
Your task is WP-00 (Repo scaffold), described in docs/plan/work-packages/wp-00-repo-scaffold.md.
Do only what it lists, write only inside its "Owns" paths, and meet every acceptance criterion.
Work on branch wp-00-repo-scaffold. When done, run `pnpm turbo run lint typecheck test build`
and open a PR with: WP id, what you built, how you tested it, SDK versions you verified,
open questions, and any deviation from the card.
If you need a contract change, stop and explain it in the PR instead.
```
