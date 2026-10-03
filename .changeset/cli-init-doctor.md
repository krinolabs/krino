---
"@krinolabs/cli": patch
---

Add `krino init` and `krino doctor`. `krino init [--trace-dir] [--force]` finds `ai` or `@anthropic-ai/claude-agent-sdk` in `package.json`, writes `krino.config.json` (project name, every decision mode `shadow`, and `traceDirectory` only when `--trace-dir` is given), and prints the wrapper snippet for that host. It never edits source files and will not overwrite an existing config without `--force`. In v0.1 only the CLI reads `krino.config.json`. `krino doctor [--project] [--trace-dir]` checks Node ≥ 22, the host SDK versions (`ai` `>=7.0.111 <8`; `@anthropic-ai/claude-agent-sdk` tested with 0.3.286), whether `AI_GATEWAY_API_KEY` is present (it never prints the value), fake-provider decisions, whether the trace folder is writable, whether recent traces parse, the cut-off rate (warns above 5%), and cache health (warns below a 50% cache read share on multi-step runs). Every warn or fail comes with a fix line. It exits 1 on any fail, otherwise 0.
