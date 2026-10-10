# ADR-022: A third package, @krinolabs/pi (amends ADR-015)

## Status

Accepted (2026-10-10). Source: the v0.2 plan, decision D28. Amends
[ADR-015](./ADR-015-two-packages.md). Implemented in WP-22 (`packages/pi/`).

## Context

People who use the `pi` CLI install extensions as Pi packages: `pi install npm:<name>`. A Pi
package is an npm package with a `pi` manifest (`pi.extensions`) and the `pi-package` keyword. Pi
installs its `dependencies` but not its peers, and it supplies its own packages
(`@earendil-works/pi-coding-agent`, `pi-ai`, `pi-agent-core`, `pi-tui`, `typebox`) to extensions.
These users write no code, so something must build the krino runtime for them.

## Decision

- Add a third public package, `@krinolabs/pi`. It is a Pi package whose default export builds the
  runtime from `krino.config.json` ([ADR-024](./ADR-024-load-krino-config.md)), picks the decision
  provider by name, and hands both to `createKrinoPiExtension()`.
- It depends on `@krinolabs/krino`. Pi's packages are `"*"` peers and are never bundled.
- The adapter code stays in `@krinolabs/krino/pi`, so SDK users need only the core package.

## Alternatives rejected

- **Make `@krinolabs/krino` a Pi package:** Pi does not install optional peers, so the core package
  could not rely on its host SDKs, and the core would carry one host's metadata.
- **Adapter export only:** CLI users would have to write and maintain an extension file; there would
  be no `pi install` story.

## Consequences

- Three packages are released together through changesets, with provenance; e2e packs and installs
  all three.
- Open question: `ai` as a regular dependency of `@krinolabs/pi`, so the optional AI Gateway
  provider works (loaded with `import()` only when configured). It makes the install bigger for
  everyone; revisit if users complain.
