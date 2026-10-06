# @krinolabs/site

The krino website and docs at [krino.sush.dev](https://krino.sush.dev). Private, never published.
Next.js (App Router, every route static), MDX, Tailwind CSS v4, and the sush.dev design tokens.

```sh
pnpm --filter @krinolabs/site dev        # http://localhost:3000
pnpm --filter @krinolabs/site build
```

## Where things live

| Path | Holds |
|---|---|
| `content/docs/*.mdx` | One file per docs page. The page title and description come from `src/docs-nav.ts`, so a page starts with its first paragraph. |
| `src/docs-nav.ts` | The docs in reading order: sidebar, sitemap, llms.txt, and Previous / Next links. |
| `src/links.ts` | GitHub, npm, and portfolio links. |
| `src/lib/seo.ts` | Metadata, sitemap, robots, JSON-LD, and llms.txt builders. |
| `src/lib/consent.ts` | GA4 Consent Mode v2 bootstrap and the stored-choice parser. |
| `src/styles/globals.css` | Tokens, docs prose, code blocks, the hero aurora. |

To add a page: write `content/docs/<slug>.mdx`, add it to `DOCS_PAGES` and `DOC_CONTENT_LOADERS`.
Tests check that the three agree. Wrap numbered steps in `<Steps>` and use `##` headings inside.
Every `ts` code block is type-checked by `@krinolabs/docs` against the published entry points.

## Environment

| Variable | Default | Effect |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://krino.sush.dev` | Canonical URLs, sitemap, Open Graph. |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | unset | GA4 id (`G-…`). Used only when `VERCEL_ENV` is `production`. |
| `VERCEL_ENV` | set by Vercel | Anything but `production` sends `X-Robots-Tag: noindex`, blocks crawlers in robots.txt, and turns GA off. |

## Deploy (Vercel)

1. Import `krinolabs/krino`. Root Directory `site`, framework Next.js. Keep "Include files outside
   the root directory" on: the changelog page reads `packages/*/CHANGELOG.md`.
2. Ignored build step: `npx turbo-ignore`.
3. Production env: `NEXT_PUBLIC_SITE_URL=https://krino.sush.dev` and
   `NEXT_PUBLIC_GA_MEASUREMENT_ID`.
4. Domain: add `krino.sush.dev`. If sush.dev's DNS is on Vercel this is automatic; otherwise add
   `CNAME krino → cname.vercel-dns.com`.
5. Google Search Console: add the property and submit `/sitemap.xml`.
