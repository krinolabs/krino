---
"@krinolabs/krino": minor
---

First release. krino is a decision layer for AI agents: it watches, prices, and safely cheapens the small decisions your agent makes. Every decision runs in shadow mode by default. Experimental: APIs may change in any release.

**Runtime (`@krinolabs/krino`)**

- `createKrino(config)` checks the config (it throws `KrinoConfigurationError` on a bad value), applies the defaults in `KRINO_CONFIG_DEFAULTS`, and returns the runtime.
- Tool selection fails open: on a timeout, an error, or a low-confidence answer, the agent gets all its tools. The risk gate fails closed: it suggests `askHuman`, and runs in shadow mode only.
- Shadow decisions run in the background and add no wait to the agent's steps. `finishRun` and `flushAll` wait for pending decisions (2 s by default) and write the unfinished ones as `cutOff`.
- The run summary's `toolSelectionAgreement` is filled from the step-0 suggestion when the adapter passes `null`.
- `thresholdFromCosts({ costOfAskingInUsd, costOfBadCallInUsd })` sets a risk-gate allow threshold: `1 - costOfAsking / costOfBadCall`, clamped to 0..1. Example: asking costs $0.50 and a bad call costs $50, so the threshold is 0.99. Threshold lookups ignore inherited object properties, so a tool named `constructor`, `toString` or `__proto__` without a threshold is `skippedUnsupported`.
- `costFromUsage` prices a step with cache read and write tokens included. `findModelPrice` and `DEFAULT_MODEL_PRICES` hold a dated price table (Claude Opus 5.5, Sonnet 5.5, Haiku 4.5, Jev).

**Vercel AI SDK adapter (`@krinolabs/krino/ai-sdk`, `ai` `>=7.0.111 <8`)**

- `withKrino(options, krino)` returns options for `generateText` or `streamText`. Step 0 asks for a tool selection. Shadow sends all tools. Enforce sends the selected tools on every step, so the tool list never changes after step 0 and the prompt cache holds.
- Each tool call goes through the shadow risk gate before the original `execute` runs.
- Each step's usage is recorded, with cache reads and writes kept out of `inputTokens`. A run summary is written on success, error and abort.
- The caller's `prepareStep` and callbacks keep running.
- With `telemetry: { isEnabled: false }`, a failure the AI SDK reports only to telemetry (a `generateText` call that throws, or a failed first `streamText` model call) writes no run summary. Aborts still do.

**Claude Agent SDK adapter (`@krinolabs/krino/claude-agent-sdk`, tested with 0.3.286)**

- `await krinoAgentOptions(queryOptions, krino, taskText, { toolDescriptions })` decides tool selection once, at run start (step 0). It adds a `PreToolUse` hook that checks each tool call's risk; in shadow mode it only records, and your hooks keep their order.
- In enforce mode it prunes tools by adding the known tools it did not suggest to `disallowedTools`. It never reads or changes `allowedTools`.
- Without `toolDescriptions`, tool selection is skipped and krino warns once.
- `observeKrinoMessages(query(...), krinoRun)` passes every message through. When the stream ends (also on error or `break`), it records the run's usage (cache tokens included), cost and main model. By default it waits for pending decisions (at most 2 s) so traces survive an immediate exit. Pass `{ waitForTracesOnEnd: false }` to write them in the background.

**Decision providers**

- `createFakeDecisionProvider` (root entry) gives scripted, offline answers, with configurable latency, timeout simulation, error injection and recorded calls. It is the default when no provider is passed, with a warning.
- `createJevAiGatewayProvider` (`@krinolabs/krino/providers/jev`) asks TypeSafe AI's Jev through Vercel AI Gateway with `experimental_evaluate`. It sends all questions in one request, cancels the HTTP request on abort or timeout, and reads its key from `AI_GATEWAY_API_KEY`. It needs the optional peers `ai` (`>=7.0.111 <8`) and `zod`. The root entry never imports `ai`.

**Traces**

- The file trace sink is the default. `createFileTraceSink({ projectName, traceDirectory? })` appends one JSON object per line to `traces-YYYY-MM-DD.jsonl` (UTC day) and rotates at 50 MB. It buffers writes in the background and never throws into the agent: a write failure is logged once to stderr. Lines are durable when the process exits after `flush`; they are not protected against power loss.
- Trace lines are not in order. Sort by `runIdentifier`, then `stepNumber`.
- Raw task text and messages stay out of traces by default (`redactContent: true`).
- `resolveTraceDirectory(projectName)` returns the folder the default sink writes to: `$KRINO_TRACE_DIRECTORY`, else an absolute `$XDG_STATE_HOME/krino/traces/<project>`, else `~/.krino/traces/<project>`.
