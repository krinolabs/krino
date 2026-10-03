# @krinolabs/cli

The `krino` command line for [krino](https://github.com/krinolabs/krino/blob/main/README.md). It
reads krino's trace files and helps you set up.

**Status: experimental.** Command options and output may change in any release.

## Install

Needs Node 22 or later. Install it next to `@krinolabs/krino`:

```sh
npm i -D @krinolabs/cli
npx krino --help
```

The CLI ships DuckDB's native binary to read traces. That binary never enters your app: the
runtime library is a separate package.

## `krino init`

```sh
npx krino init [--trace-dir <folder>] [--force]
```

- Finds `ai` or `@anthropic-ai/claude-agent-sdk` in your `package.json`.
- Writes `krino.config.json` with your project name and every decision in `shadow` mode.
- Prints the code snippet that wires krino into your host.
- Never edits your source files.
- Will not overwrite an existing `krino.config.json` unless you pass `--force`.

It exits 1 when there is no `package.json`, when the file is not valid JSON, or when the config
already exists. Otherwise it exits 0.

## `krino doctor`

```sh
npx krino doctor [--project <name>] [--trace-dir <folder>]
```

It checks:

- Node 22 or later.
- Your host SDK versions: `ai` in `>=7.0.111 <8`, and `@anthropic-ai/claude-agent-sdk` (tested
  with 0.3.286).
- Whether `AI_GATEWAY_API_KEY` is set. It never prints the value.
- Whether decisions work with the fake provider.
- Whether the trace folder is writable, and whether recent traces parse.
- The cut-off rate. It warns above 5%.
- Cache health. It warns when the cache read share of multi-step runs is below 50%, using the
  same token counts as `krino report`.
- Whether a relative `traceDirectory` in `krino.config.json` points the runtime and the CLI at
  different folders.

Every warning or failure comes with a fix line. A check with nothing to check yet shows `SKIP`,
which never counts as a pass. It exits 1 on any failure, otherwise 0.

## `krino report`

```sh
npx krino report [--project <name>] [--trace-dir <folder>] [--since 7d] [--tokens-per-tool 175] [--json]
```

It shows, per decision and mode:

- How many calls krino made.
- Agreement with what your agent did. The AI SDK measures it per step; the Claude Agent SDK
  measures it per run. Each row says which.
- The estimated cost saved if you enforce, with cache read and write tokens included.
- The latency krino added.

It also shows cache health (for all runs and for multi-step runs), the cut-off count, and one
"next step" line.

| Option | Default | What it does |
|---|---|---|
| `--project` | every project | Report on one project. |
| `--trace-dir` | the runtime's trace folder (below) | Read traces from this folder. |
| `--since` | `7d` | Only records since a duration (`12h`, `7d`, `2w`) or an ISO date. |
| `--tokens-per-tool` | `175` | Prompt tokens per tool definition, used for the estimated saving. This default is an estimate, not a measurement. |
| `--json` | off | Print JSON with a stable shape (`reportSchemaVersion: 1`). New fields may be added within a version. |

Lines with an unknown `traceSchemaVersion`, invalid JSON, or the wrong shape are skipped and
counted. Colors and the banner turn off with `NO_COLOR` and when output is not a terminal. It
exits 1 on bad options or read errors, otherwise 0.

## Where the CLI looks for traces

The CLI reads the same folder the runtime writes to:

1. `--trace-dir`, when you pass it.
2. `traceDirectory` in `krino.config.json` (`krino doctor` only).
3. `$KRINO_TRACE_DIRECTORY`.
4. `$XDG_STATE_HOME/krino/traces/<project>`, when `XDG_STATE_HOME` is an absolute path.
5. `~/.krino/traces/<project>`.

## `krino.config.json`

`krino init` writes `krino.config.json` next to your `package.json`: the project name, every
decision mode set to `shadow`, and `traceDirectory` only when you pass `--trace-dir`. A relative
path resolves from the config file's folder.

In v0.1, only the CLI (`krino doctor`) reads this file. The runtime does not: pass the same
`projectName` and `decisionModes` to `createKrino()`.

A relative `traceDirectory` can point at two different folders. The CLI resolves it from the
config file's folder. The runtime's file sink resolves the same value from the process's working
folder. `krino doctor` warns when they differ. Use an absolute path, or set
`KRINO_TRACE_DIRECTORY`, so the runtime and the CLI use the same folder.

## Benchmark

The three-setup benchmark is not part of this package. It runs from the repository: see
[bench-runner/README.md](https://github.com/krinolabs/krino/blob/main/bench-runner/README.md).

## License

[MIT](https://github.com/krinolabs/krino/blob/main/LICENSE)
