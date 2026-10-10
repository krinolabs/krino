# WP-20 · Pi adapter (`@krinolabs/krino/pi`)

> **Branch:** `wp-20-pi-adapter`  |  **Status:** ☐ not started
> **Read first:** [`AGENTS.md`](../../../AGENTS.md), [`03-contracts.md`](../shared/03-contracts.md), [`04-behavior-rules.md`](../shared/04-behavior-rules.md), [the v0.2 plan](./pi-host-and-model-routing.md), ADR-021, ADR-023, ADR-025, [Pi 1.1.0 verification](../pi-verification-1.1.0.md)
> **Before you open a PR:** [`05-review-checklist.md`](../shared/05-review-checklist.md)

- **Owner role:** Claude Code.
- **Depends on:** [WP-16](./wp-16-contracts-v2-adrs.md) (v2 stub runtime) to start;
  [WP-17](./wp-17-core-model-routing.md) and [WP-19](./wp-19-providers-routing-pi-classifier.md)
  to finish.
- **Owns:** `packages/krino/src/adapters/pi/**`; in `packages/krino/package.json` only the
  `exports["./pi"]` entry; in `packages/krino/tsup.config.ts` only the `./pi` entry.
- **Run rule:** one krino run per user prompt: `before_agent_start` starts it and
  `agent_settled` ends it (not `agent_end`, which retries and queued work can follow).
- **Step rule:** one step per Pi turn. `stepNumber` comes from **krino's own per-run counter**,
  which goes up on every `turn_end` in the run. Don't use Pi's `turnIndex`: it resets on every
  `agent_start`, and an automatic retry starts a new `agent_start` inside the same run (verified,
  V2). Tool selection and shadow routing in `before_agent_start` use `stepNumber: 0`. Risk checks
  use the current step number.
- **Main model rule:** each step's `modelIdentifier` = `provider/model` of that turn's assistant
  message (the physical model, also under `krino/auto`). The run summary's `modelIdentifier` =
  the model with the most input tokens in the run.
- **Session tool lock rule:** tool selection runs once per session, in the first run's
  `before_agent_start`. Enforce calls `pi.setActiveTools()` once and appends a `krino-tool-lock`
  entry (`pi.appendEntry`). Later runs, and resumed sessions (rebuilt from
  `ctx.sessionManager.getBranch()` on `session_start`), reuse the lock with no new decision.
- **Deliverables:**
  - `createKrinoPiExtension(piExtensionOptions)` returns a Pi extension factory (usable as a
    default export, as an SDK `extensionFactories` entry, or from `@krinolabs/pi`). Options:
    - `krinoRuntime`: a `KrinoRuntime`, or a function that gets the first event context
      (`session_start`, else the first `before_agent_start`) and returns one. It's lazy, so
      callers can build the Pi classifier provider and prices from `ctx.modelRegistry`.
    - `modelRoutingPolicy?`: the same policy passed to `createKrino`. Without it there is no
      `krino/auto` and no routing.
    - `alwaysKeptToolNames?`: tools enforce never removes (default none).
  - **Event mapping** (no work in the factory itself: Pi loads extensions without starting a
    session sometimes):

    | Pi event / API | krino action |
    |---|---|
    | `session_start` | Create session state; rebuild the tool lock from `krino-tool-lock` / `krino-tool-unlock` entries on the active branch. SDK hosts fire it only after `session.bindExtensions({})`, so also initialise lazily on the first `before_agent_start` |
    | `before_agent_start` | `startRun({ hostName: "pi", hostSdkVersion, capabilities, hostModelPrices })`; tool selection if the session has no lock; shadow routing when `krino/auto` is not selected (`canApplyRoute: false`). Fires once per prompt, never for steering or follow-ups |
    | `krino/auto` → `route(request, ctx)` | The run's **first** request → `decideModelRoute` (`canApplyRoute: true`, host model = fallback). Track "first" in the adapter: steering and follow-ups also arrive as `reason: "user"` and stay sticky. `continuation` and `retry` → the run's model. `direct` → fallback, no decision |
    | `tool_call` | `checkToolCallRisk` for top-level and nested calls; always returns `undefined`. A throw would block the tool and skip later handlers (verified) |
    | `message_end` | **Only `role === "assistant"`** (it also fires for system, user, and toolResult messages): keep the turn's model, tool calls, `usage`, and `stopReason` |
    | `turn_end` | `recordStep` with krino's step counter, then increment it |
    | `agent_settled` | Start `finishRun` **in the background** and keep the promise; don't await it in the handler (Pi awaits handlers with no timeout, so awaiting would delay `prompt()`). `runOutcome`: `aborted` → `"aborted"`; last stop reason `error` → `"error"`; else `"completed"` |
    | `session_shutdown` | Finish an open run (`"aborted"`), await the pending `finishRun` promises, then `flushAll(DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS)`. Idempotent: reload, switch, fork, and exit can all reach it. SDK `session.dispose()` does **not** emit it (verified, V11) |

  - **Tool descriptions:** active tools only (`pi.getActiveTools()`), with exposure `direct` or
    `model-only`, from `pi.getAllTools()`; kept in a `Map` by name.
  - **Enforce tool selection:** `pi.setActiveTools(selected ∪ alwaysKeptToolNames)` in the first
    run's `before_agent_start`; never adds a tool that was not active. Verified (V1): it applies
    to the first request and costs nothing, because Pi writes the opening system message after
    the handlers run. Don't also edit `systemPromptOptions.selectedTools`: an edit there wins over
    `setActiveTools()`. On a resumed session, call `setActiveTools()` only if the active set
    differs from the lock, since a later change adds a tool-removal message (check V13).
  - **Candidate availability:** `availableCandidateIdentifiers` = candidates found with
    `ctx.modelRegistry.find(provider, id)` for which `ctx.modelRegistry.hasConfiguredAuth(model)`
    is true. That's the same check Pi applies to a route (V4).
  - **Tool-selection agreement:** run 1 leaves it to the runtime (step-0 suggestion); runs 2+
    pass `toolSelectionAgreement` = every used tool is inside the session's settled suggestion
    (`null` if the suggestion never settled).
  - **Step traces:** `tokenUsage` from the assistant `usage` (`input`, `output`, `cacheRead`,
    `cacheWrite`; `cacheWrite1h` is already inside `cacheWrite`). `costInUsd` = the user's
    `priceOverrides` price when one matches, else Pi's `usage.cost.total`. Steps that end in
    `error` or `aborted` are still recorded (they cost money). Compaction, cache-warm, and nested
    tool usage are not steps (plan section 9).
  - **`krino/auto`** (only with a policy): name "Auto (krino)"; limits and thinking levels from
    the fallback model. `route()` never throws: on any error it returns the fallback. If even the
    fallback is not in the catalog, warn once at `session_start`. Enforce waits up to the
    decision timeout before the first token of the run; shadow returns at once.
  - **Model prices:** `piModelPricesFrom(modelRegistry, modelIdentifiers)` turns Pi catalog
    prices into `ModelPrice` values (the WP-17 helper) for the candidates and the current model;
    passed as `hostModelPrices` on each run.
  - **`/krino` command:** shows the mode per decision, the provider, the session lock, and the
    last routing decision. `/krino unlock` restores the tools that were active before the lock
    and appends `krino-tool-unlock`.
  - **Output:** never write to stdout (Pi's JSON and RPC modes reserve it). Warnings go to
    `ctx.ui.notify` when `ctx.hasUI`, else to stderr. Warn once if the provider is the fake one.
  - Capabilities: `{ supportedDecisions: ['toolSelection', 'riskGate', 'modelRouting'],
    toolSelectionTiming: 'runStartOnly', reportsPerStepUsage: true }`.
  - `index.ts` exports `createKrinoPiExtension`, `PI_HOST_CAPABILITIES`, `piModelPricesFrom`,
    `createPiClassifierProvider` (re-exported from WP-19), and their option types.
  - **SDK usage** (verified wiring, V3), for the README and tests:

    ```ts
    const resourceLoader = new DefaultResourceLoader({
      cwd, agentDir: getAgentDir(),
      extensionFactories: [{ name: "krino", factory: createKrinoPiExtension({ krinoRuntime: krino }) }],
    });
    await resourceLoader.reload();
    const { session } = await createAgentSession({ cwd, resourceLoader, sessionManager: SessionManager.inMemory(cwd) });
    await session.bindExtensions({}); // required, or session_start never fires
    try { await session.prompt("…"); }
    finally { session.dispose(); await krino.flushAll(DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS); } // dispose() emits no session_shutdown
    ```

  - **Verify** the open items V12 (`pi.sendUserMessage()` and `before_agent_start`) and V13 (a
    resumed file-backed session and its active tools), and re-check V1–V4, V8, and V11 against the
    installed version. Write the results in the PR. Evidence for the resolved items:
    [`../pi-verification-1.1.0.md`](../pi-verification-1.1.0.md). Pi's `fauxProvider` from
    `@earendil-works/pi-ai` makes integration tests possible with no network.
- **Acceptance:**
  - [ ] Tests run without network, through a fake `ExtensionAPI` harness that records handlers
        and replays event sequences. Fixtures use synthetic prompts only (no real prompts).
  - [ ] Shadow adds 0 ms to `before_agent_start`, `route()`, and `tool_call` (5 s provider).
  - [ ] Enforce changes the active tools once per session, never adds a tool, and keeps the lock
        across runs and across a resumed session.
  - [ ] `tool_call` never blocks: a test makes `checkToolCallRisk` throw and the handler still
        returns `undefined`.
  - [ ] `route()` never throws, and returns the run's model for `continuation` and `retry`.
  - [ ] Enforce routing without `krino/auto` records `skippedUnsupported`.
  - [ ] Step usage includes cache read and write tokens. A run with a retry counts both
        attempts, and its step numbers stay unique and increasing.
  - [ ] The run ends on `agent_settled`, not on `agent_end`. The `agent_settled` handler returns
        within a few milliseconds even when the sink takes 5 s.
  - [ ] Steering mid-run makes no new routing decision. `message_end` for non-assistant roles
        is ignored.
  - [ ] An integration test with Pi's `fauxProvider` runs the SDK wiring above end to end
        (`bindExtensions`, two prompts, `flushAll`).
  - [ ] Tool names `'constructor'`, `'toString'`, and `'__proto__'` work.
  - [ ] Nothing is written to stdout.
  - [ ] The adapter imports only `core/`, `contracts/`, `pricing/`, `providers/pi-classifier/`,
        and Pi packages. It never imports another adapter.

---

## 🚀 Kickoff prompt (paste into Claude Code, Codex, or Cursor)

```text
You are working on krino, a TypeScript decision layer for AI agents.
Read AGENTS.md, docs/plan/shared/03-contracts.md, docs/plan/shared/04-behavior-rules.md and
docs/plan/work-packages/pi-host-and-model-routing.md first.
Your task is WP-20 (Pi adapter), described in docs/plan/work-packages/wp-20-pi-adapter.md.
Do only what it lists, write only inside its "Owns" paths, and meet every acceptance criterion.
Verify every Pi event name, option, and type against the installed @earendil-works/pi-coding-agent
version before you rely on it.
Work on branch wp-20-pi-adapter in its own git worktree. When done, run
`pnpm turbo run lint typecheck test build` and open a PR with: WP id, what you built, how you
tested it, Pi versions you verified, open questions, and any deviation from the card.
If you need a contract change, stop and explain it in the PR instead.
```
