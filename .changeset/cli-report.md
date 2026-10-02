---
"@krinolabs/cli": patch
---

Add the `krino` CLI and `krino report [--project] [--since 7d] [--json]`. It reads the JSONL trace folder with DuckDB and shows, per decision kind and mode: calls, agreement per host (labeled with that host's metric), estimated cost saved if enforced (cache read and write tokens included), and added latency; plus cache health, the cut-off count and one "next step" line. Lines with a bad `traceSchemaVersion`, invalid JSON or a wrong shape are skipped and counted. `--json` prints a stable, documented shape (`reportSchemaVersion: 1`). The banner and colors respect `NO_COLOR` and non-terminal output.
