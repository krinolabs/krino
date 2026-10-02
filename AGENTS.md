# AGENTS.md — rules for every agent working on krino

## Read first
- `docs/plan/shared/03-contracts.md` and `docs/plan/shared/04-behavior-rules.md` (binding).
- Your work package card. Do only what it lists.

## Scope
- Write only inside the paths your card "Owns". Read anything.
- Do not edit packages/krino/src/contracts/** after WP-01. Need a change? Stop and write
  "CONTRACT CHANGE REQUEST" with the reason in your PR description.
- Do not add dependencies outside your card without saying why in the PR.

## Code style
- TypeScript strict. No `any`. No non-null assertions without a comment.
- Descriptive type names. No one-letter type parameters.
- Use `Array<Item>`, not `Item[]`.
- In JSX, use `condition ? <Thing /> : null`, not `condition && <Thing />`.
- ESM only. Node 22+.
- Small pure functions in core; I/O at the edges.
- Errors: never throw into the host agent from a background path. Record and continue.

## Tests
- Vitest. Every behavior in `04-behavior-rules.md` that your WP touches needs a test.
- No network in tests. Use the fake provider and recorded fixtures.
- Live tests only behind `KRINO_LIVE=1`; never in CI.

## Verify, do not guess
- SDK option names, hook names, metadata keys, and package names change often.
  Check the installed version's types or docs. Write the version you verified in the PR.

## Before you open a PR
- `pnpm turbo run lint typecheck test build` passes.
- Add a changeset if users can see the change.
- PR description: WP id, what you built, how you tested, versions verified,
  open questions, and any deviation from the card.

## Security
- Never print, log, or commit API keys.
- Redaction is on by default. Never write raw prompts to traces in tests or fixtures.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
