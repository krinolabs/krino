# WP-27 · End-to-end QA for Pi and three packages

> **Branch:** `wp-27-e2e-pi`  |  **Status:** ☐ not started
> **Read first:** [`AGENTS.md`](../../../AGENTS.md), [`03-contracts.md`](../shared/03-contracts.md), [`04-behavior-rules.md`](../shared/04-behavior-rules.md), [the v0.2 plan](./pi-host-and-model-routing.md), [WP-14](./wp-14-end-to-end-qa.md), [`e2e/README.md`](../../../e2e/README.md)
> **Before you open a PR:** [`05-review-checklist.md`](../shared/05-review-checklist.md)

- **Owner role:** Claude Code.
- **Depends on:** [WP-22](./wp-22-krinolabs-pi-package.md), [WP-23](./wp-23-report-pi-model-routing.md),
  [WP-25](./wp-25-pi-example.md) (and everything before them).
- **Owns:** `e2e/**`.
- **Deliverables:**
  - Packs all three packages (`@krinolabs/krino`, `@krinolabs/cli`, `@krinolabs/pi`) and
    installs them into temp consumer projects, as WP-14 does for two.
  - **Pi SDK consumer:** installs the Pi SDK and the packed `@krinolabs/pi`, loads its
    extension through `DefaultResourceLoader` (`additionalExtensionPaths` pointing at the
    installed package; `resource-loader.d.ts` lists the options), calls `reload()` and
    **`session.bindExtensions({})`**, and runs two prompts on Pi's `fauxProvider`. Pi's
    `session.dispose()` emits no `session_shutdown`, so the consumer calls `flushAll` itself.
    Then it runs `krino report --json` and asserts on the `pi` host, the session tool lock, and
    the routing section. Pi environment: `PI_CODING_AGENT_DIR` in a temp folder, `PI_OFFLINE=1`,
    `PI_TELEMETRY=0`.
  - **Routing on the AI SDK consumer:** the existing AI SDK consumer runs once with a routing
    policy in enforce mode and the fake provider; the report shows the routed model.
  - **Import rules** (extend `host-sdk-import-rules.ts`): the root entry imports no Pi package;
    `@krinolabs/krino/pi` imports Pi packages only as optional peers; no adapter imports
    another.
  - **Tarball rules:** `@krinolabs/pi` ships `dist/`, its `pi` manifest, and the `pi-package`
    keyword, and lists no Pi package in `dependencies`.
  - **Strict types:** a consumer compiles against `@krinolabs/krino/pi` and the new contract
    types with `strict`.
  - **Stretch:** a job that installs the tarball with the real `pi` CLI
    (`pi install <path>`) and runs `pi --mode json` with a scripted provider extension. Skip
    with a clear message when `pi` is not installed.
- **Acceptance:**
  - [ ] Runs in CI with no network and no keys.
  - [ ] Stays under 3 minutes in CI, or the PR explains the new time and how to cut it.
  - [ ] Fails if the root entry imports a host SDK, `ai`, or a Pi package.
  - [ ] Fails if `@krinolabs/pi` bundles a Pi package.

---

## 🚀 Kickoff prompt (paste into Claude Code, Codex, or Cursor)

```text
You are working on krino, a TypeScript decision layer for AI agents.
Read AGENTS.md, docs/plan/shared/03-contracts.md, docs/plan/shared/04-behavior-rules.md and
docs/plan/work-packages/pi-host-and-model-routing.md first.
Your task is WP-27 (End-to-end QA for Pi and three packages), described in
docs/plan/work-packages/wp-27-e2e-pi.md.
Do only what it lists, write only inside its "Owns" paths, and meet every acceptance criterion.
Work on branch wp-27-e2e-pi in its own git worktree. When done, run
`pnpm turbo run lint typecheck test build` and open a PR with: WP id, what you built, how you
tested it, Pi versions you verified, open questions, and any deviation from the card.
If you need a contract change, stop and explain it in the PR instead.
```
