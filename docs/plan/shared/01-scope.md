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
- Pi package (planned for v0.2, see below), Python port, hosted dashboard.

### 🏁 Release definition of done

- [ ] `npm i @krinolabs/krino` works in a fresh Node 22+ project.
- [ ] Both examples run end to end with the fake provider and with Jev.
- [ ] `krino report` reads traces from both hosts.
- [ ] `krino bench` reproduces the 3-setup comparison; results are stable across 2 reruns.
- [ ] All failure paths in `shared/04-behavior-rules.md` have tests.
- [ ] CI is green. No real API calls in pull request CI.
- [ ] Packages publish with npm provenance.

---

# 🎯 v0.2 scope

Plan: [`work-packages/pi-host-and-model-routing.md`](../work-packages/pi-host-and-model-routing.md).
Decisions: ADR-021 to ADR-026.

### ✅ In scope

| # | Feature | Host | Mode |
|---|---|---|---|
| F9 | Tool selection, session tool lock (once per session, before the first request) | Pi | shadow + enforce |
| F10 | Risk gate (fail closed) | Pi | shadow only |
| F11 | Model routing (fail open to the fallback model; first request of each run) | Pi (`krino/auto`), Vercel AI SDK | shadow + enforce |
| F12 | `@krinolabs/pi` Pi package (`pi install npm:@krinolabs/pi`) | Pi | — |
| F13 | `loadKrinoConfig()`: runtime and CLI share `krino.config.json` | Core, CLI | — |
| F14 | Pi classifier decision provider (`typesafe/jev-latest` through Pi) | Pi | — |
| F15 | Trace schema version 2; `krino report`, `init`, `doctor`, and bench for Pi and model routing | CLI | — |

### 🚫 Out of scope for v0.2

- Risk gate in enforce mode (any host).
- Model routing on the Claude Agent SDK.
- An out-of-process Pi observer for JSON or RPC mode.
- Selecting `codemode`, `deferred`, or `hidden` Pi tools.
- Nested tool usage, compaction, and cache-warm usage in step traces.
- Python port, hosted dashboard, console and OpenTelemetry sinks.

### 🏁 v0.2 definition of done

- [ ] `pi install npm:@krinolabs/pi` works on a clean machine, and one shadow prompt writes `pi`
      traces that `krino report` reads.
- [ ] The Pi SDK example runs end to end with the fake provider and with the Pi classifier.
- [ ] Model routing runs in shadow and enforce on Pi and the Vercel AI SDK; every model-routing row
      in `04-behavior-rules.md` has a test.
- [ ] `krino report` reads trace schema versions 1 and 2 and shows the model-routing section.
- [ ] `krino bench --host pi` and the routing setups reproduce across 2 fake reruns.
- [ ] CI is green. No real API calls in pull request CI.
- [ ] All three packages publish with npm provenance.
