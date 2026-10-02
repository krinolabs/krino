# WP-04 · File trace sink + redaction

> **Branch:** `wp-04-file-trace-sink-redaction`  |  **Status:** ☐ not started
> **Read first:** [`AGENTS.md`](../AGENTS.md), [`03-contracts.md`](../shared/03-contracts.md), [`04-behavior-rules.md`](../shared/04-behavior-rules.md)
> **Before you open a PR:** [`05-review-checklist.md`](../shared/05-review-checklist.md)

- **Owner role:** Codex.
- **Depends on:** [WP-01](./wp-01-contracts.md).
- **Owns:** `packages/krino/src/sinks/**`, `packages/krino/src/redaction/**`.
- **Deliverables:**
  - `createFileTraceSink({ traceDirectory?, projectName })`:
    - Default directory: `$KRINO_TRACE_DIRECTORY`, else `$XDG_STATE_HOME/krino/traces/<project>`, else `~/.krino/traces/<project>`.
    - One file per UTC day: `traces-YYYY-MM-DD.jsonl`; append-only; rotate at 50 MB.
    - Buffered async writes; `flush(timeout)` resolves when the buffer is on disk or the timeout passes.
    - Never throws into the agent: on write failure, log once to stderr and keep running.
  - `redactStepContext` and `hashContent` (SHA-256, prefix `sha256:`).
- **Acceptance:**
  - [ ] Concurrent writes from 20 runs produce valid JSONL (one object per line).
  - [ ] A child process that exits right after `flush` has all lines on disk.
  - [ ] With `redactContent: true`, no raw task text appears in any file (test by search).
  - [ ] Works on Windows paths (test with `path.win32` helpers).

---

## 🚀 Kickoff prompt (paste into Claude Code, Codex, or Cursor)

```text
You are working on krino, a TypeScript decision layer for AI agents.
Read AGENTS.md, docs/plan/shared/03-contracts.md and docs/plan/shared/04-behavior-rules.md first.
Your task is WP-04 (File trace sink + redaction), described in docs/plan/work-packages/wp-04-file-trace-sink-redaction.md.
Do only what it lists, write only inside its "Owns" paths, and meet every acceptance criterion.
Work on branch wp-04-file-trace-sink-redaction. When done, run `pnpm turbo run lint typecheck test build`
and open a PR with: WP id, what you built, how you tested it, SDK versions you verified,
open questions, and any deviation from the card.
If you need a contract change, stop and explain it in the PR instead.
```
