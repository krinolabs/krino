---
"@krinolabs/krino": patch
---

Export `resolveTraceDirectory(projectName)`: the absolute folder the default file sink writes a project's traces to (`$KRINO_TRACE_DIRECTORY`, else an absolute `$XDG_STATE_HOME/krino/traces/<project>`, else `~/.krino/traces/<project>`). The `krino` CLI uses it to read traces from where they are written.
