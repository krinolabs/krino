---
"@krinolabs/cli": patch
---

The published CLI depends on `@krinolabs/krino` with a caret range (`^<version>`) instead of an exact version, so it shares the copy of `@krinolabs/krino` your project already installs.
