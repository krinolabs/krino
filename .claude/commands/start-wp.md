---
description: Start a krino work package
argument-hint: wp-XX-name (file name without .md)
---
Read AGENTS.md, docs/plan/shared/03-contracts.md, docs/plan/shared/04-behavior-rules.md,
and docs/plan/work-packages/$ARGUMENTS.md.
Do only what that work package lists. Write only inside its "Owns" paths.
Meet every acceptance criterion. Run `pnpm turbo run lint typecheck test build`.
Then summarize what you built, how you tested it, the SDK versions you verified,
open questions, and any deviation, and open a PR from branch $ARGUMENTS.
If you need a contract change, stop and explain it instead.
