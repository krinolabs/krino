# ❓ Open items to verify (assign to WP owners)

| Item | Owner WP | Status |
|---|---|---|
| AI SDK `experimental_evaluate` API and minimum version for Jev | WP-03 | Resolved in [PR #5](https://github.com/krinolabs/krino/pull/5): added in `ai` 7.0.103, `telemetry` option in 7.0.111; peer range `>=7.0.111 <8` |
| AI SDK provider-metadata keys for Anthropic cache read/write tokens | WP-06 | Open: [PR #11](https://github.com/krinolabs/krino/pull/11) reads the split from `inputTokenDetails`; the real `providerMetadata` keys need the live AI SDK run ([live-verification.md](../live-verification.md)) |
| Claude Agent SDK hook names, signatures, and `allowedTools` merge behavior | WP-07 | Resolved in [PR #10](https://github.com/krinolabs/krino/pull/10) (SDK 0.3.286 types) and [ADR-019](../../adr/ADR-019-agent-sdk-pruning-uses-disallowed-tools.md): krino never changes `allowedTools`, so there is nothing to merge |
| Claude Agent SDK custom tool / in-process MCP API | WP-05 | Resolved in [PR #8](https://github.com/krinolabs/krino/pull/8): `createSdkMcpServer` + `tool()` |
| DuckDB Node package name and JSONL reader API | WP-09 | Resolved in [PR #9](https://github.com/krinolabs/krino/pull/9): `@duckdb/node-api` 1.5.6-r.1; Node reads the files and appends lines, because DuckDB's file readers glob every path |
| Current model prices (Claude tiers, Jev) with dates | WP-02 | Open: prices dated 2026-10-02 in [PR #3](https://github.com/krinolabs/krino/pull/3); Jev's output price is still to confirm ([live-verification.md](../live-verification.md)) |
| Node 22 / 24 support for DuckDB native binaries on Windows, macOS, Linux | WP-09 | Resolved in [PR #9](https://github.com/krinolabs/krino/pull/9): Node 22 on all three in CI (`cli-os`); Node 24 on Linux (CI) and Windows (local). Node 24 on macOS is untested |
