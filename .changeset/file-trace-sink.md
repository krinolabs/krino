---
"@krinolabs/krino": patch
---

Add the file trace sink and make it the default. `createFileTraceSink({ projectName, traceDirectory? })` appends one JSON object per line to `traces-YYYY-MM-DD.jsonl` (UTC day), rotates at 50 MB, buffers writes in the background, and never throws into the agent: a write failure is logged once to stderr. The default directory is `$KRINO_TRACE_DIRECTORY`, else `$XDG_STATE_HOME/krino/traces/<project>`, else `~/.krino/traces/<project>`.
