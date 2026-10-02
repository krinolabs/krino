---
"@krinolabs/krino": patch
---

Add the Vercel AI SDK adapter at `@krinolabs/krino/ai-sdk` (`ai` >=7.0.111 <8). `withKrino(options, krino)` returns options for `generateText` or `streamText`: step 0 asks for a tool selection (shadow sends all tools; enforce sends the selected tools on every step, so the tool list never changes after step 0 and the prompt cache holds), each tool call is recorded by the shadow risk gate before the original `execute` runs, each step's usage is recorded with cache reads and writes kept out of `inputTokens`, and a run summary is written on success, error and abort. The caller's `prepareStep` and callbacks keep running. With `telemetry: { isEnabled: false }`, a failure the AI SDK reports only to telemetry (a `generateText` call that throws, or a failed first `streamText` model call) writes no run summary; aborts still do.
