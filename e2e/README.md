# @krinolabs/e2e

Private workspace package (`"private": true`, never published). It checks the packages as a user
gets them: it packs `@krinolabs/krino` and `@krinolabs/cli` with `pnpm pack`, installs the
tarballs into consumer projects in a temp folder, and runs them there.

```sh
pnpm turbo run test --filter=@krinolabs/e2e     # builds both packages first
E2E_ONLINE=1 pnpm turbo run test --filter=@krinolabs/e2e   # before a release; needs network
KRINO_E2E_KEEP=1 pnpm turbo run test --filter=@krinolabs/e2e  # keep the temp folder
```

## What runs

The global setup (`src/setup/global-setup.ts`) packs both packages and installs two consumers:

| Consumer | Installs |
|---|---|
| with host SDKs | both tarballs, `ai`, `@anthropic-ai/claude-agent-sdk`, `typescript`, `@types/node` |
| without host SDKs | both tarballs only |

`ai`, the Agent SDK, `typescript` and `@types/node` are at the versions the workspace tests
(`packages/krino` devDependencies and the root devDependencies). The consumers' own files are in
`consumer/`.

| Test file | Checks |
|---|---|
| `tarball-contents.test.ts` | No `workspace:` left in a packed `package.json`. Only `dist/`, `README.md`, `LICENSE` and `package.json`; no tests, fixtures, snapshots or test source maps. The CLI's `@krinolabs/krino` range is `^<version>`. |
| `root-import-isolation.test.ts` | The import graph of each entry (TypeScript's scanner, dynamic imports included): krino's root and the CLI never reach `ai` or `@anthropic-ai/*`, `./ai-sdk` never reaches `@anthropic-ai/*`, `./claude-agent-sdk` never reaches `ai`. In the consumer without host SDKs: those packages do not resolve, the root entry records a run, and `krino --help` and `krino report` run. |
| `installed-packages.test.ts` | In each consumer, the `@krinolabs/krino` the consumer imports, and the one `@krinolabs/cli` imports, is the packed tarball: same `package.json`, `dist/` present, `createKrino` exported. `@krinolabs/krino@0.0.1` on npm is an empty placeholder. |
| `consumer-runs.test.ts` | An AI SDK run (`withKrino`, the AI SDK mock model, the fake decision provider) and an Agent SDK run (a simulated message stream through `krinoAgentOptions` and `observeKrinoMessages`). Then the installed CLI: `krino report --json --trace-dir` (2 runs, every step, both hosts) and `krino doctor` (0 fail). |
| `consumer-types.test.ts` | `consumer/src/public-api.ts` uses every export of every entry point and compiles under a strict tsconfig (`tsc` from the consumer). A second pass with `skipLibCheck: false` finds no errors in krino's `.d.ts` files. A new export not covered in `public-api.ts` fails the test. |

## Install modes

- **Offline** (default; CI). Nothing is downloaded. The pnpm overrides are generated from the
  packed `package.json` files plus the consumer's extras: both tarballs as `file:`, every
  third-party package as `link:` to the copy the workspace already installed. The store and
  metadata cache are empty temp folders, and `pnpm install --offline` fails if anything would
  need the registry.
- **Online** (`E2E_ONLINE=1`; never in CI). Third-party packages come from the registry at the
  ranges the tarballs publish; only the two tarballs are overridden. Run it before a release
  ([live verification](../docs/plan/live-verification.md)): it catches a published range that
  resolves to something the workspace never tested, such as a missing peer dependency.

## Time budget

WP-14 must run in CI in under 3 minutes. An offline run fails when pack, install and every test
together take more than 150 s (`OFFLINE_RUN_BUDGET_IN_SECONDS`). Locally (Windows, Node 24) a
run takes about 7–9 s after the build.

## No keys, no network

The decision provider is krino's fake provider, the AI SDK model is the AI SDK mock model, and
the Agent SDK stream is simulated: no Claude Code process and no API. Every trace is written to a
temp folder (the shared `tooling/vitest/trace-isolation.ts` setup, plus `--trace-dir` for the
CLI runs).
