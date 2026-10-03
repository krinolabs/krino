# @krinolabs/krino

krino is a TypeScript decision layer that watches, prices, and safely cheapens the small
decisions your AI agent makes. It has adapters for the Vercel AI SDK and the Claude Agent SDK.

**Status: experimental.** APIs may change in any release. See the
[project README](https://github.com/krinolabs/krino/blob/main/README.md) for the overview.

## Install

Needs Node 22 or later. ESM only.

```sh
npm i @krinolabs/krino
```

Add your host SDK. The Jev decision provider needs `ai` and `zod` on both hosts.

| Host | Install | Tested with |
|---|---|---|
| Vercel AI SDK | `npm i ai zod` | `ai` 7.0.126 (supported range `>=7.0.111 <8`) |
| Claude Agent SDK | `npm i @anthropic-ai/claude-agent-sdk ai zod` | `@anthropic-ai/claude-agent-sdk` 0.3.286 |

The host SDKs are optional peer dependencies. Install only the ones you use.

## Entry points

| Import | What it holds | Needs |
|---|---|---|
| `@krinolabs/krino` | `createKrino`, the fake provider, the file trace sink, prices, and all types | nothing |
| `@krinolabs/krino/ai-sdk` | `withKrino` | `ai` |
| `@krinolabs/krino/claude-agent-sdk` | `krinoAgentOptions`, `observeKrinoMessages` | `@anthropic-ai/claude-agent-sdk` |
| `@krinolabs/krino/providers/jev` | `createJevAiGatewayProvider` | `ai`, `zod` |

The root entry never imports a host SDK or `ai`. An end-to-end test checks this in CI.

## Quick start: Vercel AI SDK

Needs `AI_GATEWAY_API_KEY` in the environment. Run the file with Node 22.18 or later.

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

try {
  const result = await generateText(
    withKrino(
      { model: "anthropic/claude-haiku-4.5", tools, prompt: "Weather in Paris?", stopWhen: stepCountIs(5) },
      krino,
    ),
  );
  console.log(result.text);
} finally {
  // Runs on errors too, so the traces reach disk before the process exits.
  await krino.flushAll(DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS);
}
```

No AI Gateway key yet? Remove the `decisionProvider` line. krino falls back to the fake
provider, and its suggestions are placeholders.

Call `withKrino` once per `generateText` or `streamText` call. Your own `prepareStep` and
callbacks keep running.

## Quick start: Claude Agent SDK

Needs `ANTHROPIC_API_KEY` for the agent and `AI_GATEWAY_API_KEY` for Jev. The Jev provider needs
`ai` and `zod` installed too. Run the file with Node 22.18 or later.

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

No AI Gateway key yet? Remove the `decisionProvider` line. krino falls back to the fake
provider, and its suggestions are placeholders.

- `krinoAgentOptions` decides tool selection once, at run start. Without `toolDescriptions`,
  krino skips tool selection and warns once.
- In enforce mode, krino adds the tools it did not suggest to `disallowedTools`. It never reads
  or changes `allowedTools`.
- `observeKrinoMessages` passes every message through. When the stream ends, it records usage
  and cost. By default it waits up to 2 s for pending decisions, so traces survive an immediate
  exit. Pass `{ waitForTracesOnEnd: false }` to skip the wait.

## Modes

Set a mode per decision in `decisionModes`. Every decision is in `shadow` mode by default.

| Mode | What krino does |
|---|---|
| `off` | Does not ask. |
| `shadow` | Asks in the background and records the answer. Your agent behaves as before and waits for nothing. |
| `enforce` | Waits for the answer, up to `decisionTimeoutInMilliseconds`, and applies it. |

In v0.1, the risk gate runs in shadow mode only.

## Failure rules

Tool selection fails open. The risk gate fails closed. You cannot change either rule.

| Situation | Tool selection | Risk gate |
|---|---|---|
| The provider times out or fails | Send all tools | Suggest `askHuman` |
| The answer is below the confidence bar | Send all tools | Suggest `askHuman` |
| The tool has no threshold | — | Suggest `askHuman` (`skippedUnsupported`) |
| An exploration sample (enforce only) | Send all tools (`skippedExploration`) | — |
| The process exits before the answer | Nothing applied (`cutOff`) | Nothing applied (`cutOff`) |

In enforce mode, tool selection changes the tool list only at step 0 (AI SDK) or at run start
(Claude Agent SDK). A later change would break the prompt cache.

## Config

`createKrino(config)` checks the config and throws `KrinoConfigurationError` on a bad value. The
defaults come from `KRINO_CONFIG_DEFAULTS`.

| Field | Default | What it does |
|---|---|---|
| `projectName` | required | Names the trace folder and the project in reports. |
| `decisionModes` | every decision `shadow` | The mode for `toolSelection` and `riskGate`. |
| `minimumConfidence` | 0.8 | Tool selection only: below this probability, send all tools. |
| `decisionTimeoutInMilliseconds` | 800 | How long enforce mode waits for an answer. |
| `explorationRate` | 0.05 | Enforce only: the share of runs that skip enforcement to keep comparison data. |
| `riskGatePolicy` | none | Block list, allow list, and per-tool thresholds (below). |
| `decisionProvider` | the fake provider, with a warning | Who answers the questions. |
| `traceSink` | the file sink | Where traces go. |
| `redactContent` | `true` | Keeps raw task text and messages out of traces. |
| `priceOverrides` | none | Your own `ModelPrice` rows. They replace table rows for the same model. |

## Decision providers

- **Jev** (`createJevAiGatewayProvider()` from `@krinolabs/krino/providers/jev`) asks TypeSafe
  AI's Jev through Vercel AI Gateway. It reads `AI_GATEWAY_API_KEY` from the environment. It
  sends all questions for a step in one request and cancels it on timeout.
- **Fake** (`createFakeDecisionProvider()` from the root entry) answers offline, from a script.
  Use it in tests. It is the default when you pass no provider, and krino prints a warning.

## Risk gate policy

```ts
import { createKrino, type RiskGatePolicy, thresholdFromCosts } from "@krinolabs/krino";

const riskGatePolicy: RiskGatePolicy = {
  blockedToolNames: ["dropDatabase"],
  alwaysAllowedToolNames: ["searchLogs"],
  // Example costs: asking a person costs $0.50, a bad call costs $50.
  allowThresholdByToolName: {
    restartService: thresholdFromCosts({ costOfAskingInUsd: 0.5, costOfBadCallInUsd: 50 }),
  },
};

const krino = createKrino({
  projectName: "my-agent",
  decisionModes: { riskGate: "shadow" },
  riskGatePolicy,
});
```

- A blocked tool is always `block`. An always-allowed tool is always `allow`. Your lists win
  over the model.
- For any other tool, krino asks whether the call is safe. It suggests `allow` only when the
  probability reaches that tool's threshold. Otherwise it suggests `askHuman`.
- A tool with no threshold gets `askHuman`, with status `skippedUnsupported`.
- `thresholdFromCosts` returns `1 - costOfAsking / costOfBadCall`, clamped to 0..1. With the
  example costs above, that is 0.99.

## Traces

The default file sink writes one JSON object per line to `traces-YYYY-MM-DD.jsonl` (UTC day). It
starts a new file at 50 MB. It never throws into your agent: a write failure is logged once to
stderr.

The trace folder is, in order:

1. `$KRINO_TRACE_DIRECTORY`
2. `$XDG_STATE_HOME/krino/traces/<project>` (only when `XDG_STATE_HOME` is an absolute path)
3. `~/.krino/traces/<project>`

`resolveTraceDirectory(projectName)` returns this folder. To pick your own folder, pass
`traceSink: createFileTraceSink({ projectName, traceDirectory })`.

Shadow decisions finish in the background. In a short process, call
`await krino.flushAll(DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS)` before you exit. It waits up to 2 s
by default. Decisions that are still open are written with status `cutOff`.

Trace lines are not in order. Sort them by `runIdentifier`, then `stepNumber`.

## Costs

`costFromUsage(tokenUsage, modelPrice)` prices a step. It always counts cache read and cache
write tokens. `DEFAULT_MODEL_PRICES` holds dated prices for Claude Opus 5.5, Sonnet 5.5,
Haiku 4.5, and Jev. Each row has a `verifiedOn` date, and reports show it. Prices change: use
`priceOverrides` for your own rates.

## Limitations

See [Limitations](https://github.com/krinolabs/krino/blob/main/README.md#limitations) in the
project README.

## License

[MIT](https://github.com/krinolabs/krino/blob/main/LICENSE)
