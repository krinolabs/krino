# krino

<!-- banner -->

krino is a TypeScript decision layer that watches, prices, and safely cheapens the small
decisions your AI agent makes.

**Status: experimental.** v0.1 works with the Vercel AI SDK and the Claude Agent SDK. APIs may
change in any release.

## The 30-second pitch

Your agent makes many small decisions on every run. Which tools does the model need? Is this
tool call safe to run? Today the big model decides by default, and you pay for it in tokens.

krino puts a small, cheap decision model next to your agent:

- **Shadow mode first.** krino asks the decision model in the background and records its
  answers. Your agent behaves exactly as before.
- **See the cost.** `krino report` reads the traces and shows what each decision would save,
  with prompt-cache reads and writes included.
- **Enforce when the data agrees.** Turn on enforce mode for tool selection. If the decision
  model is slow or unsure, krino sends all tools. The risk gate stays in shadow mode in v0.1;
  when it is unsure, it suggests asking a human.

In our benchmark, choosing tools once at step 0 changed the cost per step by
[BENCH: cost per step, step-zero vs baseline], with a selection recall of
[BENCH: selection recall, step-zero]. See [How we measure](#how-we-measure).

## Install

krino needs Node 22 or later. The quick starts run `agent.ts` directly, which needs Node 22.18
or later. On Node 22.6 to 22.17, run `node --experimental-strip-types agent.ts` instead.

```sh
npm i @krinolabs/krino
npm i -D @krinolabs/cli
```

Then add your host SDK. Both quick starts below use the Jev decision provider, which needs `ai`
and `zod`.

| Host | Install |
|---|---|
| Vercel AI SDK | `npm i ai zod` |
| Claude Agent SDK | `npm i @anthropic-ai/claude-agent-sdk ai zod` |

## Quick start: Vercel AI SDK

Needs Node 22.18 or later to run `agent.ts` directly, and `AI_GATEWAY_API_KEY` in the
environment. Both the agent model and Jev go through Vercel AI Gateway.

```sh
mkdir my-agent && cd my-agent
npm init -y && npm pkg set type=module
npm i @krinolabs/krino @krinolabs/cli ai zod
```

Save this as `agent.ts`:

```ts
import { createKrino, DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS } from "@krinolabs/krino";
import { withKrino } from "@krinolabs/krino/ai-sdk";
import { createJevAiGatewayProvider } from "@krinolabs/krino/providers/jev";
import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";

const krino = createKrino({
  projectName: "my-agent",
  decisionModes: { toolSelection: "shadow", riskGate: "shadow" },
  decisionProvider: createJevAiGatewayProvider(),
});

const tools = {
  getWeather: tool({
    description: "Gets the current weather for a city.",
    inputSchema: z.object({ city: z.string() }),
    execute: async ({ city }) => ({ city, forecast: "sunny" }),
  }),
};

const result = await generateText(
  withKrino(
    { model: "anthropic/claude-haiku-4.5", tools, prompt: "Weather in Paris?", stopWhen: stepCountIs(5) },
    krino,
  ),
);
console.log(result.text);
await krino.flushAll(DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS);
```

```sh
export AI_GATEWAY_API_KEY=...   # never commit it
node agent.ts
npx krino report
```

No AI Gateway key yet? Remove the `decisionProvider` line. krino falls back to the fake
provider, and its suggestions are placeholders.

## Quick start: Claude Agent SDK

Needs Node 22.18 or later to run `agent.ts` directly, `ANTHROPIC_API_KEY` for the agent, and
`AI_GATEWAY_API_KEY` for Jev. The Jev provider needs `ai` and `zod` installed too.

```sh
mkdir my-agent && cd my-agent
npm init -y && npm pkg set type=module
npm i @krinolabs/krino @krinolabs/cli @anthropic-ai/claude-agent-sdk ai zod
```

Save this as `agent.ts`:

```ts
import { query } from "@anthropic-ai/claude-agent-sdk";
import { createKrino } from "@krinolabs/krino";
import { krinoAgentOptions, observeKrinoMessages } from "@krinolabs/krino/claude-agent-sdk";
import { createJevAiGatewayProvider } from "@krinolabs/krino/providers/jev";

const krino = createKrino({
  projectName: "my-agent",
  decisionModes: { toolSelection: "shadow", riskGate: "shadow" },
  decisionProvider: createJevAiGatewayProvider(),
});

const prompt = "Which files in this folder mention TODO?";
const krinoRun = await krinoAgentOptions({ allowedTools: ["Read", "Grep", "Glob"] }, krino, prompt, {
  toolDescriptions: [
    { toolName: "Read", toolDescription: "Reads a file from disk." },
    { toolName: "Grep", toolDescription: "Searches file contents with a regular expression." },
    { toolName: "Glob", toolDescription: "Finds files whose names match a pattern." },
  ],
});

for await (const message of observeKrinoMessages(query({ prompt, options: krinoRun.queryOptions }), krinoRun)) {
  if (message.type === "result" && message.subtype === "success") console.log(message.result);
}
```

```sh
export ANTHROPIC_API_KEY=... AI_GATEWAY_API_KEY=...   # never commit them
node agent.ts
npx krino report
```

No AI Gateway key yet? Remove the `decisionProvider` line. krino falls back to the fake
provider, and its suggestions are placeholders.

## Shadow → report → enforce

1. **Shadow.** Shadow is the default for every decision. krino asks in the background, adds no
   wait to your agent's steps, and changes nothing. It writes one JSON line per step to a local
   trace folder.
2. **Report.** Run `npx krino report`. Per decision, it shows how often krino agreed with what
   your agent did, the estimated cost saved if enforced, and the added latency. It also shows
   prompt-cache health and how many decisions were cut off when the process exited.
3. **Enforce.** When the report looks good, set `decisionModes: { toolSelection: "enforce" }`.
   krino then sends only the selected tools. If the decision model is slow, fails, or is not
   confident, krino sends all tools. The risk gate stays in shadow mode in v0.1.

Two more commands help you set up:

- `npx krino init` writes `krino.config.json` and prints the snippet for your host.
- `npx krino doctor` checks your Node and SDK versions, your key, the trace folder, and recent
  traces. Every warning comes with a fix.

## How it works

- **Tool selection fails open.** On a timeout, an error, or a low-confidence answer, your agent
  gets all its tools. The worst case is the cost you pay today.
- **The risk gate fails closed.** On a timeout, an error, or a tool with no threshold, krino
  suggests asking a human. Block lists in your code always win over the model.
- **Tools change only at step 0.** Changing the tool list later breaks the prompt cache for the
  whole conversation. So krino picks tools once, before the first model call (AI SDK), or at run
  start (Claude Agent SDK), and keeps that list.
- **Traces stay on your machine.** They are daily JSONL files. By default they hold no raw task
  text or messages; tool names stay.
- **Costs include the cache.** Every cost counts cache read and cache write tokens.

The defaults are in the code (`KRINO_CONFIG_DEFAULTS`): a decision timeout of 800 ms, a minimum
confidence of 0.8, and an exploration rate of 5% in enforce mode. The full design is in
[docs/plan/architecture.md](docs/plan/architecture.md). Each decision has a record in
[docs/adr/](docs/adr/).

## Limitations

- **TypeScript only.** Agents in Python or Go cannot use krino today.
- **Claude Agent SDK: run-start selection only.** The SDK gives hooks, not the loop. krino picks
  tools once per run, and its agreement metric is per run, not per step.
- **The risk gate is shadow-only in v0.1.** It records what it would do. It never blocks a call.
- **Local JSONL files do not suit serverless.** Traces live on one machine's disk.
- **Shadow decisions cost a little.** You pay for decisions you do not use yet
  ([VERIFY after ADR-018: cost per decision]). The report shows the spend.
- **One real decision provider.** Jev is the only real provider in v0.1. Its price, API, or
  availability can change.

The full list is in section 6, "Known trade-offs", of
[docs/plan/architecture.md](docs/plan/architecture.md).

## How we measure

The benchmark runs the same log-triage agent in three setups: all tools on every step, tools
pruned on every step, and tools chosen once at step 0. The method, the task set, and the spend
guard are in [bench-runner/README.md](bench-runner/README.md). Numbers marked `[BENCH: …]` will
come from the live benchmark run.

## Examples and docs

- [examples/ai-sdk-cli](examples/ai-sdk-cli): a log-triage agent on the Vercel AI SDK.
- [examples/claude-agent-sdk-cli](examples/claude-agent-sdk-cli): the same agent on the Claude
  Agent SDK.
- [@krinolabs/krino](packages/krino/README.md): the library, its config, and its entry points.
- [@krinolabs/cli](packages/cli/README.md): `krino report`, `krino init`, and `krino doctor`.
- [docs/plan/](docs/plan/README.md): the v0.1 plan, contracts, and behavior rules.
- [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
