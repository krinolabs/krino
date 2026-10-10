# 🧷 Behavior rules every WP must respect

| Situation | Tool selection (fail open) | Risk gate (fail closed) | `decisionStatus` |
|---|---|---|---|
| Shadow mode | Send all tools; record suggestion | Host behaves as before; record suggestion | `answered` |
| Provider times out | Send all tools | Suggest `askHuman` | `timedOut` |
| Provider error | Send all tools | Suggest `askHuman` | `failed` |
| Probability < minimum | Send all tools | Suggest `askHuman` | `answered` |
| Context over budget | Trim; retry once; else all tools | Suggest `askHuman` | `failed` |
| Tool has no threshold | — | Suggest `askHuman` | `skippedUnsupported` |
| Host cannot apply decision | Skip | Skip | `skippedUnsupported` |
| Exploration sample (enforce) | Send all tools | — | `skippedExploration` |
| Process exits before answer | Nothing applied | Nothing applied | `cutOff` |

- **Shadow mode never blocks.** Shadow calls run in the background and add 0 ms to the step.
- **Enforce mode waits** up to `decisionTimeoutInMilliseconds`.
- **Tool selection in enforce mode only changes the tool list on step 0** (AI SDK) or at run start (Claude Agent SDK). Never later: it breaks the prompt cache.
- **The risk gate cannot be set to fail open.** Block rules in code always win over the model.
- **The risk gate uses the tool's own threshold.** It compares the answer to the tool's entry in `riskGatePolicy.allowThresholdByToolName`, never to `minimumConfidence` (that is for tool selection only). No entry means no threshold: suggest `askHuman`.
- **Costs always include cache read and cache write tokens.**

## 🧭 Model routing (v0.2, fails open to the fallback model)

Model routing picks a model for a run from `modelRoutingPolicy.candidateModels`. On any doubt it
uses the policy's fallback model ([ADR-023](../../adr/ADR-023-model-routing-decision-kind.md)).
Every row is tested in WP-17 (core).

| Situation | Model routing | `decisionStatus` |
|---|---|---|
| Shadow mode | Host keeps its model; record the suggestion | `answered` |
| Provider times out | Fallback model | `timedOut` |
| Provider error | Fallback model | `failed` |
| Probability < minimum | Fallback model | `answered` |
| Answer names a model that is not an available candidate | Fallback model | `failed` |
| Context over budget | Trim; retry once; else fallback model | `failed` |
| Host cannot apply the decision (`canApplyRoute: false` in enforce; fallback model not available) | Skip; host keeps its model | `skippedUnsupported` |
| Exploration sample (enforce) | Fallback model | `skippedExploration` |
| Process exits before answer | Nothing applied | `cutOff` |

- **Model routing decides once per run, on its first request.** Tool follow-ups, retries,
  steering, and follow-up messages in the same run keep that model. Never switch models inside a
  run: it breaks the prompt cache. (Tested in WP-17; per host in WP-20 and WP-21.)
- **Requests outside the agent loop** (Pi `reason: "direct"`, such as compaction summaries) use the
  fallback model and are not decisions. (Tested in WP-20.)
- **Model routing uses `minimumConfidence`**, like tool selection. (Tested in WP-17.)
- **Shadow mode never changes the model**, on any host. (Tested in WP-17, WP-20, WP-21.)

## 🥧 Pi host (v0.2)

Decisions: [ADR-021](../../adr/ADR-021-pi-host-adapter.md). Every rule is tested in WP-20.

- **krino's Pi handlers never throw.** In Pi, a throwing `tool_call` handler blocks the tool, skips
  later `tool_call` handlers, and sends its message to the model; a throwing `route()` ends the
  request with an error. Catch everything, fail open (all tools, fallback model), and record the
  failure.
- **Pi awaits every handler in order, with no timeout.** krino never awaits provider calls or trace
  writes inside a Pi handler. The only exceptions are the bounded `flushAll` in `session_shutdown`
  and the enforce waits that `decisionTimeoutInMilliseconds` already bounds.
- **Pi step numbers come from krino's own per-run turn counter**, not Pi's `turnIndex`, which resets
  on every `agent_start` (an automatic retry starts a new one inside the same run).
- **The tool list changes at most once per session,** in the first run's `before_agent_start`,
  before any model request. Enforce never adds a tool that was not active. `/krino unlock` restores
  the full set (a user action, recorded in the session).
- **The risk gate is shadow-only on Pi.** The `tool_call` handler never returns `block`.
