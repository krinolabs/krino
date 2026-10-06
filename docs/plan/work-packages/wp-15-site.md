# WP-15 · Website + docs (krino.sush.dev)

> **Branch:** `wp-15-site`  |  **Status:** ⏳ not started
> **Read first:** [`AGENTS.md`](../../../AGENTS.md), [`03-contracts.md`](../shared/03-contracts.md), [`04-behavior-rules.md`](../shared/04-behavior-rules.md)
> **Before you open a PR:** [`05-review-checklist.md`](../shared/05-review-checklist.md)

- **Owner role:** Claude Code (lead reviews every word and every pixel).
- **Depends on:** [WP-13](./wp-13-docs-release.md) (content source). The **production launch** waits for the
  v0.1.0 release, because `@krinolabs/cli` is not on npm yet and every guide installs it.
- **Owns:** `site/**`, `.changeset/`.
- **Needs lead approval (out of scope, one commit each, list as deviations in the PR):**
  1. `pnpm-workspace.yaml`: add `site`.
  2. `docs/src/readme-snippets.ts`: also compile the `ts` blocks in `site/content/**/*.mdx`.
  3. `packages/krino/package.json`, `packages/cli/package.json`: `homepage` → `https://krino.sush.dev`.
  4. `README.md`: one "Website and docs" link near the top.
- **Principle:** less is more. One column, no JS that is not listed below, no page that does not earn
  its place. When unsure, leave it out.

---

## 1. Stack

| Choice | Why |
|---|---|
| Next.js (App Router), every route static | Same stack as sush.dev; Vercel native |
| `@next/mdx`, one `page.mdx` per docs page | No content layer; the file system is the CMS |
| Tailwind CSS v4 | Same tokens as sush.dev |
| `geist` (Sans, Mono, Pixel Square) | sush.dev's type |
| `rehype-pretty-code` + `shiki`, `rehype-slug` | Dual-theme code blocks; heading anchors |
| `next/og` | Build-time Open Graph images |
| GA4 via plain `next/script` | No analytics package; Consent Mode v2 by hand |

No other runtime dependencies. No `next-themes`, no UI kit, no search. Pin exact versions and write
the verified versions in the PR (registry on 2026-10-06: `next` 16.3.8, `geist` 1.7.2; check again).

Client JS is limited to three islands: theme toggle, copy button, consent bar.

## 2. Design (from sush.dev)

Copy the tokens; do not copy the components.

- **Surfaces:** `--canvas` `#f7f9fb` / `#0a0f14`, `--surface` `#fff` / `#a8cae60b`.
- **Text:** `--fg` `#18202a` / `#eaeef1`, `--fg-2` `#44525f` / `#aeb9c1`, `--fg-3` `#667685` / `#84909a`.
- **Lines:** `--hairline` `#18202a14` / `#ffffff12`, `--hairline-strong` `#18202a29` / `#ffffff24`.
- **Accent (glacier):** `--accent` `#1476a3` / `#58c1e4`, `--accent-2` `#3067a6` / `#8dbde2`,
  `--accent-fg` `#0f618a` / `#7ed6f1`, `--aurora-contrast` `#ba945e` / `#d8b579`.
- **Type:** Geist for text, Geist Mono for code and the CLI, Geist Pixel Square for the `krino` wordmark only.
  Scale: `text-sm` to `text-2xl`; no display sizes.
- **Layout:** one `max-w-2xl` column. Docs add a narrow left nav at `lg` and above, and a `<details>` menu
  below `lg`. Radii 4–8 px. Hairline borders, no shadows.
- **Aurora:** a simplified, static version (two radial gradients of `--accent` and `--aurora-contrast` at
  9–22% opacity) behind the home hero only. No animation. `prefers-reduced-transparency` turns it off.
- **Theme:** follows the system; a toggle sets `data-theme`. An inline script in `<head>` prevents the flash.
- **Favicon:** a `k` in Geist Pixel Square, SVG, both themes.

## 3. Pages

| Route | Content |
|---|---|
| `/` | Wordmark, one-sentence pitch, `npm i @krinolabs/krino` with a copy button, links to Docs · GitHub · npm. Then: shadow → report → enforce (3 numbered steps), one ~15-line AI SDK snippet, four principles (fails open, fails closed, tools change only at step 0, traces stay local), "Status: experimental". **No benchmark numbers until the live run exists.** |
| `/docs` | Introduction: what krino is, who it is for, what it is not |
| `/docs/install` | Node version, packages, host SDK table |
| `/docs/quick-start/ai-sdk` | Numbered steps: make a folder → install → save `agent.ts` → set the key → run → `npx krino report` |
| `/docs/quick-start/claude-agent-sdk` | Same steps for the Claude Agent SDK |
| `/docs/shadow-report-enforce` | The three stages as steps, with what to look for in the report before you enforce |
| `/docs/cli` | `krino init`, `krino report`, `krino doctor`: what each one does, an example, its flags |
| `/docs/configuration` | Every `createKrino` option, defaults from `KRINO_CONFIG_DEFAULTS`, decision modes |
| `/docs/how-it-works` | Failure rules, step-0 selection, traces, redaction, cost with cache |
| `/docs/limitations` | From the README and architecture §6 |
| `/docs/benchmark` | The three-setup method; "Numbers pending" until the live run |
| `/changelog` | Rendered at build time from `packages/*/CHANGELOG.md`; "No releases yet" if none exist |
| `404` | One line and a link home |

**Rules for the docs pages:**
- Every guide is numbered steps. Each step does one thing and ends in something the reader can see
  ("You should see …").
- Same voice as the README: plain, short sentences, no marketing words. Every number has a source.
- Each page ends with a "Next" link. The order lives in one `site/src/docs-nav.ts` array, which is also
  the sidebar.
- No placeholders like `[BENCH: …]` or `[VERIFY …]` on any page.

**Links (one `site/src/links.ts` constant):**
- GitHub `https://github.com/krinolabs/krino`, npm `https://www.npmjs.com/package/@krinolabs/krino`,
  portfolio `https://sush.dev`.
- Header: wordmark (home) · Docs · GitHub icon · npm icon · theme toggle.
- Footer: "Built by [Sushil Buragute](https://sush.dev)" (`rel="author"`, dofollow), MIT, GitHub, npm,
  "Cookie settings".

## 4. SEO

- `metadataBase` from `NEXT_PUBLIC_SITE_URL` (default `https://krino.sush.dev`). Title template
  `%s · krino`. Each page has its own title, a 50–160 character description, and a canonical URL.
- `<meta name="author">`, `<link rel="author" href="https://sush.dev">`.
- `app/sitemap.ts` (built from `docs-nav.ts`), `app/robots.ts` (allows all, links the sitemap).
  Preview deployments send `X-Robots-Tag: noindex`.
- JSON-LD: `SoftwareSourceCode` on `/` (name, description, `codeRepository`, `programmingLanguage`
  TypeScript, license MIT, `author` Person Sushil Buragute with `url` `https://sush.dev` and `sameAs`
  GitHub). `TechArticle` + `BreadcrumbList` on docs pages.
- Open Graph and Twitter cards: one `next/og` template (wordmark, page title, glacier accent), generated
  at build time for every route.
- `/llms.txt`: the docs index as plain Markdown links, for the AI-tool audience.
- Semantic HTML, one `h1` per page, anchored headings, descriptive link text, `lang="en"`.
- Target: Lighthouse 100 for SEO, Best Practices, and Accessibility, and ≥ 95 for Performance, on `/` and
  `/docs/quick-start/ai-sdk` (mobile).

## 5. Analytics (GA4 + Consent Mode v2)

- GA renders only when `NEXT_PUBLIC_GA_MEASUREMENT_ID` is set **and** `VERCEL_ENV === "production"`.
  Local and preview builds send nothing.
- A `beforeInteractive` inline script sets `gtag('consent','default', { analytics_storage: 'denied',
  ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' })`, then `gtag.js` loads.
- The consent bar is one line at the bottom ("Cookies for anonymous analytics? Accept · Decline"). The
  choice goes to `localStorage` (inside `try/catch`) and becomes `gtag('consent','update', …)`.
  "Cookie settings" in the footer reopens the bar.
- Events: `copy_install`, `copy_code` (with page), `outbound_click` (`github`, `npm`, `portfolio`).
  Page views are automatic.
- No ads features; IP data is handled by GA4 defaults. A short privacy note sits in the footer.

## 6. Vercel (lead does these by hand; the PR lists them)

1. Import `krinolabs/krino`. Root Directory `site`, framework Next.js, keep "Include files outside the
   root directory" on, so the workspace build works.
2. Ignored build step: `npx turbo-ignore`.
3. Env (Production): `NEXT_PUBLIC_SITE_URL=https://krino.sush.dev`, `NEXT_PUBLIC_GA_MEASUREMENT_ID=G-…`.
4. Domain: add `krino.sush.dev`. If sush.dev's DNS is on Vercel, this is automatic; otherwise add a
   `CNAME krino → cname.vercel-dns.com`.
5. Google Search Console: add the `krino.sush.dev` property and submit `/sitemap.xml`.
6. On sush.dev: add krino to the pinned work, linking to `https://krino.sush.dev` (a two-way link).

## 7. Package setup

- `site/package.json`: `"name": "@krinolabs/site"`, `"private": true`, scripts `dev`, `build`,
  `typecheck`, `test`, `lint`, `format`.
- `site/turbo.json`: extends the root; `build.outputs` = `[".next/**", "!.next/cache/**"]`;
  `build.env` = `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_GA_MEASUREMENT_ID`, `VERCEL_ENV`.
- Biome covers `site/src/**` and `site/app/**`. Strict TS, `Array<Item>`, ternaries in JSX (AGENTS.md).
- No changeset needed for the site itself (private). Approved edit 3 (`homepage`) gets a patch changeset.

## 8. Tests (Vitest, `tooling/vitest/trace-isolation.ts` in `setupFiles`)

- `docs-nav`: every nav entry has a `page.mdx`, and every `page.mdx` is in the nav.
- Metadata: every page exports a title and a 50–160 character description; no page contains `[BENCH` or
  `[VERIFY`.
- Sitemap: contains exactly the nav routes plus `/` and `/changelog`; robots links it.
- Slug lookup uses a `Map`; `constructor`, `toString`, and `__proto__` return "not found".
- Configuration page: names every key of `KRINO_CONFIG_DEFAULTS` (imported from `@krinolabs/krino`), so
  the docs cannot drift silently.
- Consent: the pure parser returns "unset" for missing, malformed, or unknown stored values.
- Links: `links.ts` values are exact (GitHub, npm, sush.dev).
- MDX `ts` blocks compile through the existing snippet check (approved edit 2).

## 9. Acceptance

- [ ] `pnpm turbo run lint typecheck test build` passes with `site` in the workspace.
- [ ] Both quick starts, copied from the site into a fresh folder, run (lead verifies, after v0.1.0).
- [ ] Lighthouse targets in §4 are met (attach the scores to the PR).
- [ ] No GA request on preview; with consent denied, no `_ga` cookie is set; Accept sets it.
- [ ] Light and dark both pass WCAG AA contrast; the page works at 360 px with no horizontal scroll.
- [ ] Every page has a canonical URL, an OG image, and appears in the sitemap.
- [ ] The footer links to sush.dev on every page; the JSON-LD author URL is `https://sush.dev`.
- [ ] Shipped JS on `/` excluding the Next runtime: only the three islands.

## 10. Open items (ask the lead)

- Wordmark: is Geist Pixel Square in `geist` 1.7.2? If not, use Geist Mono semibold.
- OG image copy: is the README pitch sentence used as is?

---

## 🚀 Kickoff prompt (paste into Claude Code, Codex, or Cursor)

```text
You are working on krino, a TypeScript decision layer for AI agents.
Read AGENTS.md, docs/plan/shared/03-contracts.md and docs/plan/shared/04-behavior-rules.md first.
Your task is WP-15 (Website + docs), described in docs/plan/work-packages/wp-15-site.md.
Do only what it lists, write only inside its "Owns" paths, and meet every acceptance criterion.
The four "Needs lead approval" edits: ask before each one and keep each in its own commit.
Work on branch wp-15-site in its own worktree. Reply with a plan first and wait for the lead's OK.
When done, run `pnpm turbo run lint typecheck test build` and open a PR with: WP id, what you built,
how you tested it, versions you verified, Lighthouse scores, the Vercel steps from §6, open questions,
and any deviation from the card.
```
