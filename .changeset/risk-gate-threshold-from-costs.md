---
"@krinolabs/krino": patch
---

Export `thresholdFromCosts({ costOfAskingInUsd, costOfBadCallInUsd })` to set a risk-gate allow threshold from what asking a person and a bad call each cost: `1 - costOfAsking / costOfBadCall`, clamped to 0..1. Asking costs $0.50 and a bad call costs $50 → 0.99. The risk gate now ignores inherited object properties when it looks up a tool's threshold, so a tool named `constructor`, `toString` or `__proto__` without a threshold is `skippedUnsupported`.
