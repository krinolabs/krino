# ADR-021: Pi host: an in-process extension, prompt runs, and a session tool lock

## Status

Accepted (2026-10-10). Source: the v0.2 plan
([`pi-host-and-model-routing.md`](../plan/work-packages/pi-host-and-model-routing.md),
decisions D21–D24) and the Pi 1.1.0 verification run
([`pi-verification-1.1.0.md`](../plan/pi-verification-1.1.0.md), V1–V4, V8, V11).
Implemented in WP-20 (`packages/krino/src/adapters/pi/`).

## Context

[Pi](https://pi.dev/) is a minimal coding-agent harness. Its extensions are TypeScript modules
loaded into the Pi process; they get lifecycle events (`before_agent_start`, `turn_end`,
`agent_settled`, …), tool control (`setActiveTools`), a `tool_call` event that can block a call,
and `registerVirtualModel` for routing. The same extension runs in Pi's CLI modes (interactive,
print, JSON, RPC) and in apps that embed Pi with the SDK. Interactive sessions are long and hold
many user prompts.

Facts verified against `@earendil-works/pi-coding-agent` 1.1.0:

- A run is `before_agent_start` → `agent_settled`. Steering and follow-up messages do **not** fire
  `before_agent_start`; they become extra turns in the same run, and `route()` sees them with
  `reason: "user"`.
- `turnIndex` is 0-based but resets on every `agent_start`, and an automatic retry starts a new
  `agent_start` inside the same run. `agent_start` and `agent_end` can fire more than once per run.
- A tool change in the first run's `before_agent_start` costs nothing: Pi writes the session's
  opening system message after those handlers run, so the first request already declares only the
  narrowed set. A later change adds a system message with `toolsRemoved`.
- Pi awaits every handler in order, with no timeout (a 1.5 s `agent_settled` handler delayed
  `prompt()` by 1.5 s).
- SDK hosts must call `await session.bindExtensions({})`, or `session_start` never fires.
  `session.dispose()` emits no `session_shutdown`. The CLI modes await `session_shutdown`; Ctrl+C in
  print mode skips it.
- A throwing `tool_call` handler blocks the tool, skips later `tool_call` handlers, and sends its
  message to the model as the tool result. A throwing `route()` ends that request with an error.

## Decision

- krino supports Pi through one extension factory, `createKrinoPiExtension()`, exported from
  `@krinolabs/krino/pi`. `HostName` gains `"pi"`.
- **Run = one user prompt:** `before_agent_start` starts a krino run and `agent_settled` ends it.
  The adapter tracks the run's first request itself, because steering and follow-ups add turns
  without a new `before_agent_start`.
- **Step = one turn,** numbered by krino's own per-run turn counter, not Pi's `turnIndex`. Tool
  selection and shadow routing in `before_agent_start` use `stepNumber: 0`.
- **Session tool lock:** tool selection runs once per session, in the first run's
  `before_agent_start`, before any model request. Enforce calls `pi.setActiveTools()` once and saves
  the lock with `pi.appendEntry()`. Later runs and resumed sessions reuse it with no new decision
  and no new tool change. `/krino unlock` restores the full set.
- **Capabilities:** `{ supportedDecisions: ['toolSelection', 'riskGate', 'modelRouting'],
  toolSelectionTiming: 'runStartOnly', reportsPerStepUsage: true }`. Tool-selection agreement is
  per run: every used tool is inside the session's locked suggestion.
- **Never block, never stall, never throw:**
  - krino's Pi handlers catch everything and fail open (all tools, fallback model).
  - The risk gate is shadow-only: the `tool_call` handler never returns `block`.
  - krino never awaits provider calls or trace writes inside a Pi handler. The two exceptions are
    the bounded `flushAll` in `session_shutdown` and the enforce waits, which the decision timeout
    already bounds.
- **SDK hosts** call `await session.bindExtensions({})` and call `krino.flushAll()` themselves after
  `session.dispose()`.

## Alternatives rejected

- **Run = the whole session:** the run summary would reach disk only at exit, and a crash loses it.
- **Re-pick tools on every prompt:** each change after the first request adds a transcript delta,
  and many transports then resend the tool list, which can break the cache prefix.
- **An out-of-process observer for Pi's JSON or RPC mode:** it sees events but cannot change tools,
  route models, or pause a tool call.

## Consequences

- The adapter depends on Pi 1.x event names (optional peer `>=1.1.0 <2`); `krino doctor` checks the
  version.
- Ctrl+C in print mode and SDK hosts that skip `flushAll` leave `cutOff` records; the report shows
  them.
- A lock that is too narrow for a later prompt costs that prompt a tool; `/krino unlock` and the
  per-run agreement metric make this visible.
- Revisit when Pi adds a native per-session tool budget or changes how tool deltas reach providers.
