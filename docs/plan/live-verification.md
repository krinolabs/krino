# Live verification day (needs AI_GATEWAY_API_KEY and ANTHROPIC_API_KEY)

Run in this order. Each item must pass before release.

- [ ] Set spend limits on both keys.
- [ ] WP-03: `smoke:jev` with KRINO_RECORD_FIXTURES=1 → billing table → finish ADR-018.
- [ ] WP-03: confirm Jev's real output price; update the price table.
- [ ] WP-06: live AI SDK run → report + providerMetadata shape.
- [ ] WP-07: live Agent SDK run → report + usage shapes; cost matches the console.
- [ ] WP-12: live AI SDK example. First confirm the model ID `anthropic/claude-haiku-4.5`
      (`LIVE_MODEL_IDENTIFIER` in `examples/ai-sdk-cli/src/log-triage.ts`) is still served by
      AI Gateway. In `examples/ai-sdk-cli`: `pnpm start --trace-dir ./traces`, then
      `pnpm exec krino report --trace-dir ./traces` (needs AI_GATEWAY_API_KEY).
- [ ] WP-12: live Agent SDK example. First confirm the model ID `claude-haiku-4-5`
      (`LIVE_MODEL_IDENTIFIER` in `examples/claude-agent-sdk-cli/src/log-triage.ts`). In
      `examples/claude-agent-sdk-cli`: `pnpm start --trace-dir ./traces`, then
      `pnpm exec krino report --trace-dir ./traces` (needs both keys).
- [ ] First hand-made trace (M3): 10 runs + `krino report` screenshot.
- [ ] WP-10: `krino bench --pilot`, then the full bench twice (stable results).
- [ ] WP-10: scaling check (10 / 25 / 50 / 100 tools).
