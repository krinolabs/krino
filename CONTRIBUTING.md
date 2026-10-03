# Contributing to krino

Thanks for your interest. krino is experimental, and the v0.1 design is fixed by a written plan.
Please read these first:

- [AGENTS.md](AGENTS.md): the rules for every change, by people or coding agents.
- [docs/plan/README.md](docs/plan/README.md): the v0.1 plan and its work packages.
- [docs/plan/shared/03-contracts.md](docs/plan/shared/03-contracts.md) and
  [docs/plan/shared/04-behavior-rules.md](docs/plan/shared/04-behavior-rules.md): binding.
- [docs/adr/](docs/adr/): why the design looks the way it does.

## Set up

You need Node 22 or later and pnpm (the version is in `package.json`, under `packageManager`).

```sh
pnpm install
pnpm turbo run lint typecheck test build
```

That last command must pass before you open a pull request.

## Rules in short

- TypeScript strict. No `any`.
- Tests use Vitest and sit next to the code as `*.test.ts`.
- Tests never use the network. Use the fake provider and recorded fixtures.
- Live tests run only with `KRINO_LIVE=1`, and never in CI.
- The contracts in `packages/krino/src/contracts/` are frozen. To change one, explain why in an
  issue or pull request first.
- Never commit API keys. Never write raw prompts into traces or fixtures.

## Changesets

If users can see your change, add a changeset:

```sh
pnpm changeset
```

## Security problems

Do not open a public issue. Follow [SECURITY.md](SECURITY.md).
