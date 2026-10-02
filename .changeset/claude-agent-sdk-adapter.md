---
"@krinolabs/krino": patch
---

Add the Claude Agent SDK adapter at `@krinolabs/krino/claude-agent-sdk`. `await krinoAgentOptions(queryOptions, krino, taskText, { toolDescriptions })` decides tool selection once at run start (step 0) and adds a `PreToolUse` hook that checks each tool call's risk (shadow: records only; the user's hooks keep their order). In enforce mode it prunes tools by adding the known-but-not-suggested ones to `disallowedTools`; it never reads or changes `allowedTools`. Without `toolDescriptions`, tool selection is skipped and krino warns once. `observeKrinoMessages(query(...), krinoRun)` passes every message through and, when the stream ends (also on error or `break`), records the run's usage (cache tokens included), cost and main model. The run summary's `toolSelectionAgreement` is now filled by the runtime from the settled step-0 suggestion when the adapter passes `null`. Tested with `@anthropic-ai/claude-agent-sdk` 0.3.286.
