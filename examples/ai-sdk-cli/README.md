# Log-triage agent · Vercel AI SDK + krino

A CLI agent that finds out why a checkout request failed, with the bench mock tool catalog. krino
runs in shadow mode: it records which tools it would send and whether each call looks safe, and
changes nothing. The examples run inside this repo (they use the private bench catalog).

## Install

```sh
pnpm install
pnpm turbo run build --filter=@krinolabs/example-ai-sdk-cli...
cd examples/ai-sdk-cli
```

## Run with `--fake` (no keys, no network)

```sh
pnpm start --fake --trace-dir ./traces
```

The AI SDK mock language model plays the run and krino's fake decision provider answers.
`--task task-052` runs a task that calls a write tool; `--tools 10|25|50|100` sets the tool count.

## Run live

Needs `AI_GATEWAY_API_KEY`, read from the environment only. The agent model
(`anthropic/claude-haiku-4.5`, set in `src/log-triage.ts`) and the Jev decision provider both go
through Vercel AI Gateway. Set a spend limit on the key.

```sh
export AI_GATEWAY_API_KEY=...   # never commit it
pnpm start --trace-dir ./traces
```

## Read the traces

```sh
pnpm exec krino report --trace-dir ./traces
```
