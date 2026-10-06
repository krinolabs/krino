# v0.1.0 release checklist

Do these in order. Each step must pass before the next one. Do not merge the "Version packages"
pull request before step 11.

- [ ] **1. Verification day done.** Every box in [`live-verification.md`](./live-verification.md)
      is checked, with spend limits set on both keys.
- [ ] **2. ADR-018 finished (billing verdict).** The `smoke:jev` billing table is recorded and
      [ADR-018](../adr/ADR-018-tool-selection-question-shape.md) states the verdict. Replace
      `[VERIFY after ADR-018: cost per decision]` in the root `README.md` with the measured cost
      and its source.
- [ ] **3. Prices verified and dated.** Every row in `packages/krino/src/pricing/price-table.ts`
      matches the provider's price page, and its `verifiedOn` date is the day you checked.
      Remove the `VERIFY BEFORE RELEASE` comment.
- [ ] **4. Benchmark placeholders filled.** Every `[BENCH: …]` in `README.md` is replaced with a
      number from the live bench results JSON (`chartRows`), with the run date and the
      bench-runner version as its source. Search the repo for `[BENCH:` and `[VERIFY` to be
      sure none are left.
- [ ] **5. E2E online run passed.**
      `E2E_ONLINE=1 pnpm turbo run test --filter=@krinolabs/e2e` (see
      [`e2e/README.md`](../../e2e/README.md)).
- [ ] **6. Snippet check passes.** `pnpm turbo run test --filter=@krinolabs/docs` compiles every
      TypeScript block in the READMEs.
- [ ] **7. Branding.** Replace `<!-- banner -->` in `README.md` with the light/dark `<picture>`
      banner. Package READMEs need absolute image URLs (npm does not resolve relative paths).
- [ ] **8. npm org and GitHub org 2FA confirmed.** Two-factor authentication is required for
      every member of the `krinolabs` npm org and the `krinolabs` GitHub org.
- [ ] **9. Remove `"private": true` from `@krinolabs/cli`** (`packages/cli/package.json`).
- [ ] **10. Publish `@krinolabs/cli` once by hand**, so the package exists on npm. From
      `packages/cli` after a build: `pnpm publish --access public`. Use `pnpm`, not `npm`: it
      turns `workspace:^` into a real version range. pnpm publishes only from `main` with a
      clean working tree (otherwise `ERR_PNPM_GIT_NOT_CORRECT_BRANCH`). Provenance works only
      in CI, and `publishConfig.provenance` is `true`; if the publish refuses for that reason,
      turn provenance off for this one publish only, and do not commit that change. That edit
      makes the tree dirty, so add `--no-git-checks` to that one publish. Check the tarball
      first with `pnpm pack --dry-run` (it lists the files; pnpm 12's `pnpm publish --dry-run`
      does not). Then deprecate the placeholder:
      `npm deprecate @krinolabs/cli@0.0.0 "placeholder, use >=0.1.0"`.
- [ ] **11. Add the npm trusted publisher for `@krinolabs/cli`:** repository `krinolabs/krino`,
      workflow `release.yml`. Check that `@krinolabs/krino` has the same trusted publisher.
- [ ] **12. Merge the "Version packages" pull request.** Before merging, confirm it bumps BOTH
      packages to 0.1.0: `@krinolabs/krino` and `@krinolabs/cli`. Changesets skips private
      packages: until step 9 lands on `main`, that pull request bumps only `@krinolabs/krino`,
      and the CLI changeset stays pending. After the merge, the Release workflow publishes both
      with provenance.
- [ ] **13. Fresh-project install test from npm.** In an empty folder, on Node 22, follow both
      quick starts in `README.md` word for word, with packages from the npm registry. Then run
      `npx krino report` and `npx krino doctor`.
- [ ] **14. Enable private vulnerability reporting** (Settings → Security), so the steps in
      [`SECURITY.md`](../../SECURITY.md) work.
- [ ] **15. GitHub repository description, topics, and social preview image.**
- [ ] **16. Launch post.** Every number in it has a source or says "example".
