---
"@krinolabs/cli": patch
---

`krino report` now shows the cache read share twice, in the text table and in `--json`: for all runs, and for multi-step runs only (new additive field `cacheHealth.multiStepRuns`, still `reportSchemaVersion: 1`). A one-step run cannot read from the cache, so the "next step" cache rule now uses the multi-step share. This is the same share `krino doctor` warns on.
