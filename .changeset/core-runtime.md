---
"@krinolabs/krino": patch
---

Add the core runtime: `createKrino(config)` validates the config, applies defaults and returns a runtime that runs tool selection (fails open) and the risk gate (fails closed, shadow only), tracks background decisions, writes `cutOff` on flush, and fills trace fields and costs. Also exports `costFromUsage`, `findModelPrice` and a dated price table (Claude Opus 5.5, Sonnet 5.5, Haiku 4.5, Jev).
