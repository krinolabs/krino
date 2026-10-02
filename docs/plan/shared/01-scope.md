# 🎯 v0.1 scope

### ✅ In scope

| # | Feature | Host | Mode |
|---|---|---|---|
| F1 | Tool selection, step 0 | Vercel AI SDK | shadow + enforce |
| F2 | Tool selection, run start | Claude Agent SDK | shadow + enforce |
| F3 | Risk gate (fail closed) | Both | shadow only |
| F4 | Traces: one JSONL line per step, cache-aware cost | Both | always |
| F5 | `krino report`: cost, agreement, cache health, cut-offs | CLI | — |
| F6 | `krino bench` + mock 100-tool catalog | CLI | — |
| F7 | `krino init` + `krino doctor` | CLI | — |
| F8 | Decision providers: fake (default in tests), Jev via Vercel AI Gateway | Core | — |

### 🚫 Out of scope for v0.1

- Model routing, stop check, verified cascade.
- Risk gate in enforce mode.
- Console and OpenTelemetry sinks (file sink only).
- Calibration report, replay, diff.
- Pi package, Python port, hosted dashboard.

### 🏁 Release definition of done

- [ ] `npm i @krinolabs/krino` works in a fresh Node 22+ project.
- [ ] Both examples run end to end with the fake provider and with Jev.
- [ ] `krino report` reads traces from both hosts.
- [ ] `krino bench` reproduces the 3-setup comparison; results are stable across 2 reruns.
- [ ] All failure paths in `shared/04-behavior-rules.md` have tests.
- [ ] CI is green. No real API calls in pull request CI.
- [ ] Packages publish with npm provenance.
