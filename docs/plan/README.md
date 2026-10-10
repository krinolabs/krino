# krino plan index (v0.1 and v0.2)

> Owner: Sushil (lead, reviewer, merger). Workers: Claude Code, Codex, Cursor agents.
> Put this folder at `docs/plan/` in the repo. Copy `AGENTS.md` and `CLAUDE.md` to the repo root.

## 📁 What is in this folder

| File | Purpose |
|---|---|
| [`AGENTS.md`](../../AGENTS.md) | Rules every agent follows (copy to repo root) |
| [`CLAUDE.md`](../../CLAUDE.md) | One line that makes Claude Code read `AGENTS.md` (copy to repo root) |
| [`architecture.md`](./architecture.md) | Architecture, decisions, trade-offs, perks |
| [`shared/01-scope.md`](./shared/01-scope.md) | v0.1 and v0.2 scope, with each release's definition of done |
| [`shared/02-repo-layout.md`](./shared/02-repo-layout.md) | Target folders and package exports |
| [`shared/03-contracts.md`](./shared/03-contracts.md) | **Binding** frozen types |
| [`shared/04-behavior-rules.md`](./shared/04-behavior-rules.md) | **Binding** fail-open / fail-closed rules |
| [`shared/05-review-checklist.md`](./shared/05-review-checklist.md) | PR review checklist |
| [`shared/06-open-items.md`](./shared/06-open-items.md) | APIs to verify |
| [`shared/07-timeline.md`](./shared/07-timeline.md) | Weekend timeline |
| [`release-checklist.md`](./release-checklist.md) | v0.1.0 release steps, in order |
| [`v0.2-backlog.md`](./v0.2-backlog.md) | Parked contract and feature requests |
| [`work-packages/pi-host-and-model-routing.md`](./work-packages/pi-host-and-model-routing.md) | v0.2 plan: Pi host and model routing (WP-16 to WP-28) |
| [`pi-verification-1.1.0.md`](./pi-verification-1.1.0.md) | Pi 1.1.0 behavior, verified before the v0.2 WPs |
| `work-packages/wp-XX-*.md` | One file per agent task, with its own kickoff prompt |

## 🧭 How to use it


1. **Run phase 0 yourself** (or with one agent). It creates the repo skeleton and freezes the contracts. Nothing else starts before it merges.
2. **Assign each work package (WP) to one agent**, in its own git worktree and branch: `wp-XX-short-name`.
3. **Give the agent three things:** `AGENTS.md`, its work package file. Each file ends with a ready kickoff prompt.
4. **One WP = one pull request.** Review against the WP's acceptance criteria. Merge in dependency order (the dependency graph below).
5. **Contracts are frozen** after WP-01. An agent that needs a contract change stops, writes the request in its PR description, and waits.

### 🧰 Tool fit (suggested)

| Tool | Best for |
|---|---|
| Claude Code | WPs with many files and design judgment: WP-02, WP-06, WP-07, WP-10 |
| Codex | Well-specified, test-heavy WPs: WP-03, WP-04, WP-08, WP-11 |
| Cursor | UI-like or content-heavy WPs, quick iterations: WP-05, WP-09, WP-12, WP-13 |

All tools read `AGENTS.md`. Claude Code reads `CLAUDE.md`, which imports `AGENTS.md` ([`AGENTS.md`](../../AGENTS.md)).

## 🔗 Dependencies and waves


```mermaid
flowchart LR
  WP00[WP-00 Scaffold] --> WP01[WP-01 Contracts]
  WP01 --> WP02[WP-02 Core runtime]
  WP01 --> WP03[WP-03 Providers]
  WP01 --> WP04[WP-04 File sink]
  WP01 --> WP05[WP-05 Mock catalog]
  WP01 --> WP08[WP-08 Risk gate policy]
  WP01 --> WP09[WP-09 CLI + report]
  WP02 --> WP06[WP-06 AI SDK adapter]
  WP02 --> WP07[WP-07 Claude Agent SDK adapter]
  WP03 --> WP06
  WP03 --> WP07
  WP04 --> WP06
  WP04 --> WP07
  WP08 --> WP06
  WP08 --> WP07
  WP05 --> WP10[WP-10 bench]
  WP06 --> WP10
  WP09 --> WP10
  WP09 --> WP11[WP-11 init + doctor]
  WP06 --> WP12[WP-12 Examples]
  WP07 --> WP12
  WP05 --> WP12
  WP10 --> WP13[WP-13 Docs + release]
  WP11 --> WP13
  WP12 --> WP14[WP-14 End-to-end QA]
  WP14 --> WP13
```

| Wave | Work packages (parallel inside a wave) | Agents at once |
|---|---|---|
| 0 | WP-00 → WP-01 (sequential) | 1 |
| 1 | WP-02, WP-03, WP-04, WP-05, WP-08, WP-09 | up to 6 |
| 2 | WP-06, WP-07, WP-11 | up to 3 |
| 3 | WP-10, WP-12 | 2 |
| 4 | WP-14 → WP-13 | 1 |

## ✅ Work package tracker

| Done | WP | Title |
|---|---|---|
| ☑ | [WP-00](./work-packages/wp-00-repo-scaffold.md) | Repo scaffold |
| ☑ | [WP-01](./work-packages/wp-01-contracts.md) | Contracts |
| ☑ | [WP-02](./work-packages/wp-02-core-runtime.md) | Core runtime |
| ☑ | [WP-03](./work-packages/wp-03-decision-providers.md) | Decision providers |
| ☑ | [WP-04](./work-packages/wp-04-file-trace-sink-redaction.md) | File trace sink + redaction |
| ☑ | [WP-05](./work-packages/wp-05-mock-tool-catalog-task-set.md) | Mock tool catalog + task set |
| ☑ | [WP-06](./work-packages/wp-06-vercel-ai-sdk-adapter.md) | Vercel AI SDK adapter |
| ☑ | [WP-07](./work-packages/wp-07-claude-agent-sdk-adapter.md) | Claude Agent SDK adapter |
| ☑ | [WP-08](./work-packages/wp-08-risk-gate-policy.md) | Risk gate policy |
| ☑ | [WP-09](./work-packages/wp-09-cli-foundation-krino-report.md) | CLI foundation + `krino report` |
| ☑ | [WP-10](./work-packages/wp-10-krino-bench.md) | `krino bench` |
| ☑ | [WP-11](./work-packages/wp-11-krino-init-krino-doctor.md) | `krino init` + `krino doctor` |
| ☑ | [WP-12](./work-packages/wp-12-examples.md) | Examples |
| ☑ | [WP-13](./work-packages/wp-13-docs-release.md) | Docs + release |
| ☑ | [WP-14](./work-packages/wp-14-end-to-end-qa.md) | End-to-end QA |
| ☑ | [WP-15](./work-packages/wp-15-site.md) | Website + docs (krino.sush.dev) |

## 🧩 v0.2: Pi host and model routing

The plan is in [`work-packages/pi-host-and-model-routing.md`](./work-packages/pi-host-and-model-routing.md):
requirements, design decisions D21–D32, contract changes, behavior rules, and verify items.
The same rules apply as in v0.1: one WP = one agent = one worktree = one PR, and each agent
sends a plan for the lead's OK before writing code. By lead decision (2026-10-10), the v2
contracts from WP-16 ship in 0.1.0.

```mermaid
flowchart LR
  WP16[WP-16 Contracts v2 + ADRs] --> WP17[WP-17 Core routing]
  WP16 --> WP18[WP-18 Config loader]
  WP16 --> WP19[WP-19 Providers]
  WP16 --> WP23[WP-23 Report]
  WP17 --> WP20[WP-20 Pi adapter]
  WP19 --> WP20
  WP17 --> WP21[WP-21 AI SDK routing]
  WP19 --> WP21
  WP18 --> WP22[WP-22 @krinolabs/pi]
  WP20 --> WP22
  WP18 --> WP24[WP-24 init + doctor]
  WP22 --> WP24
  WP20 --> WP25[WP-25 Pi example]
  WP20 --> WP26[WP-26 Bench on Pi]
  WP21 --> WP26
  WP23 --> WP26
  WP25 --> WP26
  WP22 --> WP27[WP-27 E2E]
  WP25 --> WP27
  WP23 --> WP27
  WP24 --> WP28[WP-28 Docs + release]
  WP26 --> WP28
  WP27 --> WP28
```

| Wave | Work packages (parallel inside a wave) | Agents at once |
|---|---|---|
| 0 | WP-16 | 1 |
| 1 | WP-17, WP-18, WP-19, WP-23 | up to 4 |
| 2 | WP-20, WP-21 (both may start on the v2 stub runtime in wave 1) | 2 |
| 3 | WP-22, WP-24, WP-25 | 3 |
| 4 | WP-26, WP-27 | 2 |
| 5 | WP-28 | 1 |

| Done | WP | Title |
|---|---|---|
| ☑ | [WP-16](./work-packages/wp-16-contracts-v2-adrs.md) | Contracts v2 + ADR-021–026 |
| ☐ | [WP-17](./work-packages/wp-17-core-model-routing.md) | Core: model routing, trace v2, host prices |
| ☐ | [WP-18](./work-packages/wp-18-config-loader.md) | `loadKrinoConfig` (shared config file) |
| ☐ | [WP-19](./work-packages/wp-19-providers-routing-pi-classifier.md) | Providers: routing questions + Pi classifier |
| ☐ | [WP-20](./work-packages/wp-20-pi-adapter.md) | Pi adapter (`@krinolabs/krino/pi`) |
| ☐ | [WP-21](./work-packages/wp-21-ai-sdk-model-routing.md) | AI SDK model routing |
| ☐ | [WP-22](./work-packages/wp-22-krinolabs-pi-package.md) | `@krinolabs/pi` Pi package |
| ☐ | [WP-23](./work-packages/wp-23-report-pi-model-routing.md) | `krino report`: Pi, model routing, trace v2 |
| ☐ | [WP-24](./work-packages/wp-24-init-doctor-pi.md) | `krino init` + `krino doctor` for Pi |
| ☐ | [WP-25](./work-packages/wp-25-pi-example.md) | Example: `examples/pi-cli` |
| ☐ | [WP-26](./work-packages/wp-26-bench-on-pi.md) | Benchmark on Pi (tool selection + model routing) |
| ☐ | [WP-27](./work-packages/wp-27-e2e-pi.md) | End-to-end QA for Pi and three packages |
| ☐ | [WP-28](./work-packages/wp-28-docs-site-release-v0-2.md) | Docs, site, and v0.2.0 release |
