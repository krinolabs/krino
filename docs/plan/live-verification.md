# Live verification day (needs AI_GATEWAY_API_KEY and ANTHROPIC_API_KEY)

Run in this order. Each item must pass before release. The step-by-step version, with expected
output, cost estimates and stop conditions, is [`verification-runbook.md`](./verification-runbook.md).

Run every command from the repository root unless the item says otherwise.

- [ ] Set spend limits on both keys.
- [ ] WP-14: run e2e with E2E_ONLINE=1 (needs network, no keys):
      `E2E_ONLINE=1 pnpm turbo run test --filter=@krinolabs/e2e`. It installs the packed tarballs
      with third-party packages from the registry at their published ranges (`e2e/README.md`).
- [ ] WP-03: billing check with fixtures → billing table → finish ADR-018:
      `KRINO_LIVE=1 KRINO_RECORD_FIXTURES=1 pnpm --filter @krinolabs/krino smoke:jev`.
      Without `KRINO_LIVE=1` it prints `smoke:jev skipped` and exits 0, so check that the
      billing table and the `verdict:` line were printed.
- [ ] WP-03: confirm Jev's real output price; update the price table.
- [ ] WP-06: live AI SDK run → report + providerMetadata shape:
      `KRINO_LIVE=1 pnpm --filter @krinolabs/krino live:ai-sdk`.
- [ ] WP-07: live Agent SDK run → report + usage shapes; cost matches the console:
      `pnpm turbo run build --filter=@krinolabs/bench --filter=@krinolabs/cli`, then
      `KRINO_LIVE=1 node --experimental-strip-types packages/krino/scripts/live-claude-agent-sdk.ts`.
      Set ANTHROPIC_API_KEY: without it the Agent SDK falls back to the Claude CLI login, and
      the cost will not show in the API console.
- [ ] WP-12: live AI SDK example. First confirm the model ID `anthropic/claude-haiku-4.5`
      (`LIVE_MODEL_IDENTIFIER` in `examples/ai-sdk-cli/src/log-triage.ts`) is still served by
      AI Gateway. In `examples/ai-sdk-cli`: `pnpm start --trace-dir ./traces`, then
      `pnpm exec krino report --trace-dir ./traces` (needs AI_GATEWAY_API_KEY).
- [ ] WP-12: live Agent SDK example. First confirm the model ID `claude-haiku-4-5`
      (`LIVE_MODEL_IDENTIFIER` in `examples/claude-agent-sdk-cli/src/log-triage.ts`). In
      `examples/claude-agent-sdk-cli`: `pnpm start --trace-dir ./traces`, then
      `pnpm exec krino report --trace-dir ./traces` (needs both keys).
- [ ] Agent SDK: confirm PreToolUse fires after the assistant tool_use message, as the simulated
      stream assumes. No command prints this order yet (see the runbook, open items).
- [ ] Agent SDK live run: confirm the PreToolUse check sees the exact built-in tool names Read,
      Grep, and Glob. No command covers this yet: both live Agent SDK runs set `tools: []`, so
      no built-in tool is offered (see the runbook, open items).
- [ ] First hand-made trace (M3): 10 runs + `krino report` screenshot.
- [ ] WP-10: build once: `pnpm turbo run build --filter=@krinolabs/bench-runner...`. Run the
      bench as `node bench-runner/dist/main.js` (`pnpm --filter … exec krino-bench` does not
      work: pnpm does not link a package's own bin into its own `node_modules/.bin`). Every
      bench command needs AI_GATEWAY_API_KEY, prints its spend estimate, and refuses to start
      (exit 4) when the estimate is over `--max-spend-usd` (default $20). Check that the text
      output has no `SIMULATED` line and says `mode: live`, and that the results JSON has
      `"mode": "live"`. Exit codes: `bench-runner/README.md`.
      The main runs keep krino's 800 ms decision timeout. Check the "timed out" column
      (`toolSelectionTimeoutShare`): if it is high, step-zero failed open and its numbers show
      the timeout, not pruning. Diagnose with an extra run that adds `--decision-timeout-ms 3000`;
      never publish that run as a main result.
- [ ] WP-10 pilot (≈ $1.26 estimated):
      `node bench-runner/dist/main.js --pilot --trace-dir ./bench-traces/pilot`
- [ ] WP-10 full bench, run 1 (≈ $15.14 estimated):
      `node bench-runner/dist/main.js --trace-dir ./bench-traces/full-1`
- [ ] WP-10 full bench, run 2 (≈ $15.14 estimated; stable results: compare the two `chartRows`):
      `node bench-runner/dist/main.js --trace-dir ./bench-traces/full-2`
- [ ] WP-10 scaling check, 10 / 25 / 50 / 100 tools (≈ $4.92 estimated):
      `node bench-runner/dist/main.js --setups step-zero --tool-counts 10,25,50,100 --repeats 1 --trace-dir ./bench-traces/scaling`
