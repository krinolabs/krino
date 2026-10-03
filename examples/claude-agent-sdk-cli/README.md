# Log-triage agent · Claude Agent SDK + krino

The `examples/ai-sdk-cli` agent on the Claude Agent SDK, with the bench catalog as an MCP server.
krino runs in shadow mode: it records which tools it would allow and whether each call looks safe,
and changes nothing. The examples run inside this repo (they use the private bench catalog).

## Install

```sh
pnpm install
pnpm turbo run build --filter=@krinolabs/example-claude-agent-sdk-cli...
cd examples/claude-agent-sdk-cli
```

## Run with `--fake` (no keys, no network)

```sh
pnpm start --fake --trace-dir ./traces
```

A scripted Agent SDK message stream stands in for `query()`; every line it prints is labelled
`[simulated]`. krino's hooks and fake decision provider run for real.
`--task task-052` runs a task that calls a write tool; `--tools 10|25|50|100` sets the tool count.

## Run live

Needs `ANTHROPIC_API_KEY` (the agent, `claude-haiku-4-5`, set in `src/log-triage.ts`) and
`AI_GATEWAY_API_KEY` (the Jev decision provider), read from the environment only. Set spend limits.

```sh
export ANTHROPIC_API_KEY=... AI_GATEWAY_API_KEY=...   # never commit them
pnpm start --trace-dir ./traces
```

## Read the traces

```sh
pnpm exec krino report --trace-dir ./traces
```
