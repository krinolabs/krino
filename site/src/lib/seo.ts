import type { Metadata, MetadataRoute } from "next";
import { DOCS_PAGES, type DocsPage } from "../docs-nav";
import { LINKS } from "../links";
import { AUTHOR, absoluteUrl, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "./site";

export const CHANGELOG_PAGE = {
  href: "/changelog",
  title: "Changelog",
  description:
    "Release notes for @krinolabs/krino and @krinolabs/cli, newest first, taken from each package's changelog at build time.",
} as const;

/** Every indexable route, home first. */
export function indexableRoutes(): Array<string> {
  return ["/", ...DOCS_PAGES.map((docsPage) => docsPage.href), CHANGELOG_PAGE.href];
}

export function buildSitemap(siteUrl: string): MetadataRoute.Sitemap {
  return indexableRoutes().map((route) => ({
    url: route === "/" ? siteUrl : `${siteUrl}${route}`,
    changeFrequency: "weekly",
    priority: route === "/" ? 1 : 0.7,
  }));
}

/** Production allows every crawler and links the sitemap. Every other build blocks crawlers. */
export function buildRobots(siteUrl: string, isProduction: boolean): MetadataRoute.Robots {
  if (!isProduction) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}

/** Title, description, canonical URL, and social cards for one page. */
export function pageMetadata(page: { title: string; description: string; href: string }): Metadata {
  const canonicalUrl = absoluteUrl(page.href);
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      type: "article",
      siteName: SITE_NAME,
      title: page.title,
      description: page.description,
      url: canonicalUrl,
    },
    twitter: { card: "summary_large_image", title: page.title, description: page.description },
  };
}

/** JSON for a script element: `<` is escaped so a value can never close the element. */
export function serializeJsonLd(jsonLdData: unknown): string {
  return JSON.stringify(jsonLdData).replaceAll("<", "\\u003c");
}

const AUTHOR_PERSON = {
  "@type": "Person",
  name: AUTHOR.name,
  url: AUTHOR.url,
} as const;

export function softwareSourceCodeJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareSourceCode",
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    codeRepository: LINKS.github,
    programmingLanguage: "TypeScript",
    runtimePlatform: "Node.js 22",
    license: "https://opensource.org/licenses/MIT",
    author: AUTHOR_PERSON,
    sameAs: [LINKS.github, LINKS.npm],
  };
}

export function docsPageJsonLd(docsPage: DocsPage): Array<Record<string, unknown>> {
  const pageUrl = absoluteUrl(docsPage.href);
  const breadcrumbItems = [
    { name: SITE_NAME, url: SITE_URL },
    { name: "Docs", url: absoluteUrl("/docs") },
    ...(docsPage.href === "/docs" ? [] : [{ name: docsPage.title, url: pageUrl }]),
  ];
  return [
    {
      "@context": "https://schema.org",
      "@type": "TechArticle",
      headline: docsPage.title,
      description: docsPage.description,
      url: pageUrl,
      author: AUTHOR_PERSON,
      publisher: AUTHOR_PERSON,
      isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: breadcrumbItems.map((breadcrumbItem, itemIndex) => ({
        "@type": "ListItem",
        position: itemIndex + 1,
        name: breadcrumbItem.name,
        item: breadcrumbItem.url,
      })),
    },
  ];
}

/** /llms.txt: the docs index as plain Markdown (https://llmstxt.org). */
export function buildLlmsText(siteUrl: string): string {
  const docsLines = DOCS_PAGES.map(
    (docsPage) => `- [${docsPage.title}](${siteUrl}${docsPage.href}): ${docsPage.description}`,
  );
  return [
    `# ${SITE_NAME}`,
    "",
    `> ${SITE_DESCRIPTION}`,
    "",
    "Status: experimental. Works with the Vercel AI SDK and the Claude Agent SDK.",
    "",
    "## Docs",
    "",
    ...docsLines,
    "",
    "## Links",
    "",
    `- [GitHub](${LINKS.github})`,
    `- [npm](${LINKS.npm})`,
    `- [Changelog](${siteUrl}${CHANGELOG_PAGE.href})`,
    "",
  ].join("\n");
}
