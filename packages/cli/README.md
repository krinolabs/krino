# @krinolabs/cli

The `krino` command line: reports, benchmarks, and setup checks for
[krino](https://github.com/krinolabs/krino). Status: early, not ready for production. See the
[v0.1 plan](https://github.com/krinolabs/krino/blob/main/docs/plan/README.md).

## `krino.config.json`

`krino init` writes `krino.config.json` next to your `package.json`: the project name, every
decision mode set to `shadow`, and `traceDirectory` only when you pass `--trace-dir` (a relative
path resolves from the config file's folder). It prints the wrapper snippet for the host SDK it
finds in `package.json` and never edits your source files.

In v0.1 only the krino CLI (`krino doctor`) reads this file. The runtime does not: pass the same
`projectName` and `decisionModes` to `createKrino()`.
