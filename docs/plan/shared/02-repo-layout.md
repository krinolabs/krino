# 🗂️ Repository layout (target)

```
krino/
├─ AGENTS.md                         # rules for every agent
├─ CLAUDE.md                         # one line: @AGENTS.md
├─ docs/
│  ├─ plan/                          # this plan folder
│  ├─ adr/                           # decision records ADR-001…ADR-012
│  ├─ brand/                         # banners, logos (from the brand pack)
│  └─ cfp-abstract.md
├─ packages/
│  ├─ krino/                         # @krinolabs/krino (published)
│  │  ├─ src/
│  │  │  ├─ contracts/               # WP-01: types only, frozen
│  │  │  ├─ core/                    # WP-02: runtime, modes, failure rules, flush, cost
│  │  │  ├─ risk-gate/               # WP-08: pure policy functions
│  │  │  ├─ providers/
│  │  │  │  ├─ fake/                 # WP-03
│  │  │  │  └─ jev-ai-gateway/       # WP-03
│  │  │  ├─ sinks/file/              # WP-04
│  │  │  ├─ pricing/                 # WP-02: price table with dates
│  │  │  ├─ adapters/
│  │  │  │  ├─ ai-sdk/               # WP-06
│  │  │  │  └─ claude-agent-sdk/     # WP-07
│  │  │  └─ index.ts
│  │  ├─ test/
│  │  └─ package.json
│  └─ cli/                           # @krinolabs/cli (published, bin: krino)
│     └─ src/
│        ├─ commands/                # report (WP-09), bench (WP-10), init + doctor (WP-11)
│        ├─ trace-reader/            # WP-09: DuckDB over JSONL
│        └─ banner/                  # from brand pack (krino-banner.ts)
├─ bench/                            # WP-05: mock catalog, task set (private)
├─ examples/
│  ├─ ai-sdk-cli/                    # WP-12 (private)
│  └─ claude-agent-sdk-cli/          # WP-12 (private)
├─ .changeset/
├─ .github/workflows/                # ci.yml, release.yml
├─ biome.json
├─ turbo.json
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
└─ package.json
```

### 📦 Package exports (core)

| Import path | Contents | Peer dependency |
|---|---|---|
| `@krinolabs/krino` | `createKrino`, contracts, fake provider, file sink | none |
| `@krinolabs/krino/ai-sdk` | `withKrino`, AI SDK adapter | `ai` (optional) |
| `@krinolabs/krino/claude-agent-sdk` | `krinoAgentOptions`, hooks | `@anthropic-ai/claude-agent-sdk` (optional) |
| `@krinolabs/krino/providers/jev` | `createJevAiGatewayProvider` | `ai` (optional) |
