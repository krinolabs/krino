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
- **Costs always include cache read and cache write tokens.**
