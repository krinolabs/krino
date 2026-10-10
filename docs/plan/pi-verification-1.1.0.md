<!-- Produced by the v0.2 verification check on 2026-10-10. It installed Pi 1.1.0 into a scratch folder (pi-spike/pkg) and ran experiments with Pi's faux provider: no network, no keys, and nothing written to ~/.pi. File:line references point into that install (pca = @earendil-works/pi-coding-agent/dist, pai = @earendil-works/pi-ai/dist). Re-check them when the Pi version changes. -->

# Pi 1.1.0 verification report (plan section 7)

Date: 2026-10-10. Installed `@earendil-works/pi-coding-agent@1.1.0` (with `pi-ai` and `pi-agent-core`
1.1.0) via `npm install --ignore-scripts` into `pi-spike/pkg`. Experiments: `pi-spike/scripts/exp.mjs`,
`sysdump.mjs`, and `slow-settled.mjs`, run with Pi's own faux provider (`fauxProvider` from pi-ai),
`SessionManager.inMemory`, `SettingsManager.inMemory`, `PI_CODING_AGENT_DIR=pi-spike/agent`,
`PI_OFFLINE=1`, `PI_TELEMETRY=0`, and `PI_SKIP_VERSION_CHECK=1`. There was no network traffic and no
keys. `~/.pi` still had no entries after every run. Raw output is in `pi-spike/out/*.json`.

Paths below are relative to `pkg/node_modules/@earendil-works/`, with `pca` = `pi-coding-agent/dist`
and `pai` = `pi-ai/dist`.

## Impact summary

**WP-16 contract shapes:** no change is needed. Two notes:

- Pi's Jev catalog price is 0. Decision cost cannot come from the classifier's `usage.cost`; see V5.
  This affects WP-19, not the contracts.
- Everything the contracts assume can be built: run boundaries, routing on the first request with
  sticky later requests, availability checks, and `runOutcome`.

**WP-20 design changes:**

1. **SDK hosts must call `await session.bindExtensions({})`.** `createAgentSession()` never emits
   `session_start`. Without that call, every other event fires but `session_start` does not, so the
   adapter must also initialise lazily on the first `before_agent_start`.
2. **`session.dispose()` does not emit `session_shutdown`.** Only `AgentSessionRuntime.dispose()`
   and the CLI modes do. SDK users need an explicit `krino.flushAll()`. Document this and test it.
3. **Never await slow work in `agent_settled`.** Every handler is awaited, with no timeout. A 1.5 s
   `agent_settled` handler delayed `prompt()` by 1.5 s. Run `finishRun` in the background, and await
   the pending promises in `session_shutdown` or `flushAll`.
4. **Step numbers need a krino-owned counter.** An automatic retry starts a new `agent_start` in the
   same run and resets `turnIndex` to 0. `turnIndex` is 0-based but not unique within a krino run.
   `agent_start` and `agent_end` can fire more than once per run.
5. **Filter `message_end` to `role === "assistant"`.** It also fires for `system` (loadout and
   prompt-section updates), `user`, and `toolResult` messages.
6. **`tool_execution_start` fires before `tool_call`.** A blocked tool still emits
   `tool_execution_start` and `tool_execution_end` (`isError: true`) without running.
7. **Steering and follow-ups do not fire `before_agent_start`.** They add turns to the same run, and
   `route()` sees `reason: "user"` for them, so the adapter must track the run's first request
   itself. This confirms the plan's sticky rule.
8. **Use the same availability check Pi uses.** Pi rejects a route to a model without credentials
   (`hasConfiguredAuth`). Use `ctx.modelRegistry.hasConfiguredAuth(model)` for
   `availableCandidateIdentifiers`.

**Plan and cache (V6, static):** changing tools in the first run's `before_agent_start` costs
nothing. The leading system message is written after the handlers run, so the first request already
declares only the narrowed set, with no transition message. Later changes add a system message with
`toolsRemoved`. Anthropic models that the catalog marks `supportsMidConvoToolChanges` send that
natively and keep the prefix; all other transports resend the current tool list when a tool is
removed. The session lock is the right design. A live check is still needed (WP-26).

---

## V1: `setActiveTools()` vs `systemPromptOptions.selectedTools`

- **Answer:** both levers apply to the **first** request of the run, and both change the **tool
  declarations**, not only the prompt text. The change persists as the session's active set for
  later prompts. If a handler edits `selectedTools`, that edit wins; otherwise the live loadout
  (from `setActiveTools`) is used.
- **Evidence:**
  - `pca/core/agent-session.js:1590-1597`: "Handlers may edit event.systemPromptOptions.selectedTools
    or call setActiveTools() … An explicit edit wins; otherwise the live loadout is authoritative."
  - `pca/core/agent-session.js:1303-1305` (`_preparePromptAndToolLoadout` → `_applyToolLoadout` sets
    `agent.state.tools`) runs before `_runAgentPrompt` (`:1626-1631`).
  - Experiment `sysdump-{setActiveTools,selectedTools}.json`: the first request's leading system
    message has `toolsAdded: ["read","alpha"]` (not all 7 tools), and there is no delta message. The
    second prompt sends the same leading message unchanged.
  - Experiment `bindSetActive.json`: the second prompt's `getActiveTools()` is `["read","alpha"]`.
    `selectedTools.json` gives `activeAfter = ["read","beta"]`.
  - Experiment `sysdump-late.json`: changing tools on the second prompt adds
    `{role:"system", sections:["tools","rules"], toolsRemoved:[…5 tools]}` before the new user
    message.
- **Confidence:** high (code and experiment agree).
- **Impact:** WP-20 can use `pi.setActiveTools()` (simplest). The session lock applied in run 1 has
  zero transition cost. A rebuilt lock on a resumed session must not change tools again; that would
  add a delta.

## V2: run lifecycle

- **Answer:**
  - `before_agent_start` fires once per `prompt()` that starts a run. Steering and follow-ups queued
    during a run do **not** fire it; they become extra turns in the same run, before one
    `agent_settled`.
  - `turnIndex` is 0-based and resets on every `agent_start`.
  - An automatic retry emits its own assistant `message_end` (`stopReason: "error"`), `turn_end #0`,
    and `agent_end` for the failed attempt. It then starts a new `agent_start` with `turn_start #0`
    again in the same run, with no new `before_agent_start`.
- **Event order (one tool call, then an answer):**

  ```text
  session_start(startup) → before_agent_start → agent_start → turn_start#0 → message_end(system, first prompt only) →
  message_end(user) → message_end(assistant:toolUse) → tool_execution_start → tool_call → [execute] →
  tool_execution_end → message_end(toolResult) → turn_end#0 → turn_start#1 → message_end(assistant:stop) →
  turn_end#1 → agent_end → agent_before_settle → agent_settled
  ```

  With a retry: `… message_end(assistant:error) → turn_end#0 → agent_end → [auto_retry_start] →
  agent_start → turn_start#0 → message_end(assistant:stop) → turn_end#0 → agent_end → agent_before_settle → agent_settled`.
- **Evidence:**
  - `pca/core/agent-session.js:1556-1567`: while streaming, `prompt()` queues through
    `_queueFollowUp` or `_queueSteer` and returns before `emitBeforeAgentStart` (`:1591`).
  - `:880-881` resets `_turnIndex = 0` on `agent_start`; `:899` increments it on `turn_end`.
  - Experiments: `steerFollow.json`, `retry.json`, and `bindSetActive.json`.
- **Confidence:** high.
- **Impact:** see WP-20 notes 4, 5, 6, and 7 above. A run = `before_agent_start` →
  `agent_settled` is confirmed.

## V3: SDK wiring for an inline extension

- **Answer:** pass the factory through `DefaultResourceLoader({ extensionFactories })` and call
  `await resourceLoader.reload()`. You **must** call `await session.bindExtensions({})` for
  `session_start` to fire. `createAgentSession` never calls it; only the CLI modes do.
- **Evidence:**
  - `pca/core/agent-session.js:2598-2618`: `bindExtensions` is the only place that emits
    `this._sessionStartEvent`.
  - Callers are only `modes/print-mode.js:53`, `modes/rpc/rpc-mode.js:230`, and
    `modes/interactive/interactive-mode.js:1476`.
  - Experiment `noBind.json`: every event except `session_start` fires. `bindSetActive.json` shows
    `session_start startup`.
  - `pca/core/resource-loader.d.ts:70-124` lists the options. `InlineExtension` is a factory or
    `{ name, factory, hidden? }` (`pca/core/extensions/types.d.ts:1495`).
- **Minimal snippet (verified):**

  ```ts
  import { createAgentSession, DefaultResourceLoader, SessionManager, getAgentDir } from "@earendil-works/pi-coding-agent";
  const resourceLoader = new DefaultResourceLoader({
    cwd, agentDir: getAgentDir(),
    extensionFactories: [{ name: "krino", factory: createKrinoPiExtension({ krinoRuntime }) }],
  });
  await resourceLoader.reload();
  const { session } = await createAgentSession({ cwd, resourceLoader, sessionManager: SessionManager.inMemory(cwd) });
  await session.bindExtensions({});          // required: emits session_start
  try { await session.prompt("…"); }
  finally { session.dispose(); await krino.flushAll(DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS); } // dispose() emits no session_shutdown
  ```

- **Confidence:** high.

## V4: checking a model's credentials from an extension

- **Answer:** `ctx.modelRegistry.hasConfiguredAuth(model)` is synchronous and reads the snapshot of
  configured providers. This is the exact check Pi applies to a route target. Other options:
  `ctx.modelRegistry.getAvailable()` (synchronous list of models with configured auth) and
  `await ctx.modelRegistry.getAvailableOfType("classifier", "typesafe")` (asynchronous, "working
  credentials").
- **Evidence:**
  - `pca/core/model-registry.d.ts:28,32,44`.
  - `pca/core/model-registry.js:21-33` → `model-runtime.js:327-329,361-363`.
  - The route check is at `pca/core/model-runtime.js:749-750`: `if (!this.hasConfiguredAuth(target.provider)) throw …`.
- **Confidence:** high.
- **Impact:** WP-20 builds `availableCandidateIdentifiers` from `find(provider, id)` plus
  `hasConfiguredAuth(model)`.

## V5 (static): the typesafe classifier

- **Credentials:** a stored credential first (Pi's auth store, for example after `/login typesafe`,
  type `api_key`), then the environment variable `TYPESAFE_API_KEY`.
  - Evidence: `pai/providers/typesafe.js:10` (`envApiKeyAuth("TypeSafe API key", ["TYPESAFE_API_KEY"])`),
    `pai/auth/helpers.js:16-27`, and `pai/env-api-keys.js:91`.
  - **`krino doctor` checking only the variable gives a false "missing" for `/login` users.** Use
    `getAvailableOfType` at run time instead.
- **Catalog:** `typesafe/jev-latest` is bundled (`pai/providers/data/typesafe.json`): type
  `classifier`, api `typesafe-system-one`, baseUrl `https://api.typesafe.ai/v1/`, contextWindow
  64000, and **cost all 0**. `usage` is priced from the catalog
  (`pai/api/classifier-shared.js:82-96`), so `usage.cost.total` is always 0.
  - **WP-19 must price Jev decisions from krino's own table** (using token counts when present),
    not from `usage.cost`.
- **Timeout and abort:** no default timeout. `options.timeoutMs` applies per attempt, `options.signal`
  is combined with it through `AbortSignal.any`, and **`maxRetries` defaults to 2**
  (`pai/api/classifier-shared.js:46-71`). `classify` never rejects. A failure returns
  `stopReason: "aborted"` (when the signal aborted) or `"error"`, with `errorMessage`
  (`pai/api/system-one-shared.js:93-96`). A missing provider or credentials also returns an error
  result (`pai/models.js:500-513`). Options pass through `applyAuth` to the provider (`:508-509`).
  - **WP-19 should pass `{ signal, timeoutMs, maxRetries: 0 }`.**
- **Wire detail:** `bool` questions travel as `noul`, and the mapping is internal. Choice answers
  carry `probabilities` and `confidence` (`system-one-shared.js:19-55`).
- **Not verified:** real latency (needs a key; verification day).
- **Confidence:** high for the code paths.

## V7: `prepareStep` `model` in `ai` 7.0.126

- **Answer:** per step only, exactly like `activeTools` (ADR-020). The outer `model` is a `const`
  that is never reassigned. Each step does `prepareStepResult?.model ?? model`, so enforce must
  return the routed model on every step. Strings are accepted (`resolveLanguageModel`).
- **Evidence** (`C:/Work/krino/node_modules/.pnpm/ai@7.0.126_zod@4.6.5/node_modules/ai/dist/index.js`):
  - `generateText`: `:5127` `const model = resolveLanguageModel(modelArg);` and `:5339`
    `const stepModel = resolveLanguageModel(prepareStepResult?.model ?? model);`.
  - `streamText`: the `model` parameter (`:8583`) is never reassigned in the function, and `:9443`
    `const stepModel = resolveLanguageModel(prepareStepResult?.model ?? model);`.
- **Confidence:** high.
- **Impact:** WP-21 as planned (return the model on every step). No ADR-020 addendum is needed.

## V8: reading the Pi version at runtime

- **Answer:** `import { VERSION } from "@earendil-works/pi-coding-agent"` gives `"1.1.0"`. Inside
  the CLI, extensions resolve that package to the host's own copy (jiti alias or virtual modules),
  so `VERSION` is the running Pi's version.
- **Evidence:**
  - `pca/index.d.ts:2`, `pca/config.js:474` (`VERSION = pkg.version`).
  - `pca/core/extensions/loader.js:36-63,471-476` (alias `"@earendil-works/pi-coding-agent"`).
  - Experiment `slow-settled.mjs` printed `VERSION export: 1.1.0`.
- **Confidence:** high. A compiled `@krinolabs/pi` loaded from `node_modules` should be checked in
  WP-22 (V9), because Pi warns that physical copies bypass the mapping.

## V11: are `session_shutdown` handlers awaited?

- **CLI modes:** yes. Print and JSON modes call `disposeRuntime()` → `await runtimeHost.dispose()`
  in `finally` and on SIGTERM and SIGHUP (`pca/modes/print-mode.js:23-43,138`).
  `AgentSessionRuntime.dispose()` awaits `emitSessionShutdownEvent(…, { reason: "quit" })`
  (`pca/core/agent-session-runtime.js:297-305`). RPC awaits `runtimeHost.dispose()` before
  `process.exit` (`pca/modes/rpc/rpc-mode.js:579-595`). Interactive mode awaits it on signals and on
  quit (`interactive-mode.js:3486-3492`). New, resume, fork, and switch await it in
  `teardownCurrent` (`agent-session-runtime.js:103-112`). Reload emits `reason: "reload"`
  (`agent-session.js:2939`).
  - SIGINT is **not** handled in print mode, so Ctrl+C there skips shutdown and leaves `cutOff`
    records.
- **No timeout:** `runner.emit` awaits each handler in turn and only catches errors
  (`pca/core/extensions/runner.js`, `async emit`). A slow flush delays Pi's exit, so keep krino's
  bounded `flushAll` (2 s).
- **SDK:** `AgentSession.dispose()` is synchronous and emits **no** `session_shutdown`
  (`pca/core/agent-session.js:992-1011`). Experiments `bindSetActive.json` and `slow-settled.mjs`
  saw no `session_shutdown` after `session.dispose()`.
- **Confidence:** high.

## A throwing `tool_call` handler blocks the tool

- **Confirmed.** `runner.emitToolCall` has no per-handler try/catch, so one throw also **skips later
  `tool_call` handlers** (`pca/core/extensions/runner.js:957-971`). `_beforeToolCall` rethrows
  (`pca/core/agent-session.js:327-345`), and the agent loop turns that into an error tool result
  without running the tool (`pi-agent-core/dist/agent-loop.js:490-539`). Pi sends **the thrown
  message to the model as the tool result**.
- Experiment `toolCallThrows.json`: no `exec:alpha`; `tool_execution_end isError=true "krino handler bug"`.

## A throwing `route()` fails the request

- **Confirmed.** The comment at `pca/core/agent-session.js:459-461` says "A routing failure rejects,
  which ends the run with an error response". `model-runtime.js:738-751` also throws when the route
  names a non-physical model or one without credentials.
- Experiment `route.json`: the second prompt's assistant message has `stopReason: "error"` and
  `errorMessage: "router bug"`. The run still settles, `prompt()` resolves, and there is no retry.
- Also observed: steering inside a run makes `route()` run again with `reason: "user"` and
  `previous` set.

## V6 (static only; live check still WP-26)

- `pai/api/anthropic-messages.js:120-131,860-873,1020-1040`: when the model's compat flags
  `supportsMidConvoSystemMessages` and `supportsMidConvoToolChanges` are set, later tool changes
  become `tool_removal` and `tool_addition` blocks. The request-level tool list stays fixed, plus a
  deferred placeholder tool, which Pi says keeps the cache ("measured: full miss without it").
  - In the bundled catalog, 7 of 17 Anthropic models set the flag: claude-fable-5, claude-fable-5-1,
    claude-haiku-5-5, claude-opus-4-8, claude-opus-5, claude-opus-5-5, and claude-sonnet-5-5.
    claude-haiku-4-5 does not.
- Other transports: `pai/utils/transcript.js:181-200` (`resolveTranscriptTools`) can anchor
  **additions only**. Any removal resends the current tool list, which changes the prefix (OpenAI
  Responses, Codex, completions, and Azure).

## Not covered

- V9 (`pi install` of a package with optional peers) needs the real `pi` CLI writing to
  `~/.pi/agent/settings.json`. It was skipped on purpose and belongs to WP-22.
- V10 (cost accuracy) needs live keys.
- Whether `pi.sendUserMessage()` from another extension starts a run with `before_agent_start` was
  not tested.
- Whether a resumed persisted session restores the narrowed active tool set was not tested (file
  sessions were avoided to keep writes in the scratchpad).
