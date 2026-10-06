import { describe, expect, it } from "vitest";
import { DOCS_PAGES } from "../docs-nav";
import { LINKS } from "../links";
import {
  buildLlmsText,
  buildRobots,
  buildSitemap,
  docsPageJsonLd,
  indexableRoutes,
  pageMetadata,
  serializeJsonLd,
  softwareSourceCodeJsonLd,
} from "./seo";

const SITE_URL = "https://krino.sush.dev";

describe("buildSitemap", () => {
  it("lists home, every docs page, and the changelog, and nothing else", () => {
    const sitemapUrls = buildSitemap(SITE_URL).map((sitemapEntry) => sitemapEntry.url);
    expect(sitemapUrls).toEqual([
      SITE_URL,
      ...DOCS_PAGES.map((docsPage) => `${SITE_URL}${docsPage.href}`),
      `${SITE_URL}/changelog`,
    ]);
  });

  it("matches the indexable routes", () => {
    expect(buildSitemap(SITE_URL)).toHaveLength(indexableRoutes().length);
  });
});

describe("buildRobots", () => {
  it("allows crawlers and links the sitemap in production", () => {
    expect(buildRobots(SITE_URL, true)).toEqual({
      rules: { userAgent: "*", allow: "/" },
      sitemap: `${SITE_URL}/sitemap.xml`,
    });
  });

  it("blocks crawlers everywhere else", () => {
    expect(buildRobots(SITE_URL, false)).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });
});

describe("pageMetadata", () => {
  it("sets the title, description, canonical URL, and social cards", () => {
    const metadata = pageMetadata({
      title: "CLI",
      description: "A description that is long enough to be a real description.",
      href: "/docs/cli",
    });
    expect(metadata.title).toBe("CLI");
    expect(metadata.alternates?.canonical).toBe(`${SITE_URL}/docs/cli`);
    expect(metadata.openGraph?.url).toBe(`${SITE_URL}/docs/cli`);
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image" });
  });
});

describe("JSON-LD", () => {
  it("names Sushil Buragute at sush.dev as the author", () => {
    expect(softwareSourceCodeJsonLd()).toMatchObject({
      author: { "@type": "Person", name: "Sushil Buragute", url: "https://sush.dev" },
      codeRepository: LINKS.github,
    });
  });

  it("adds a TechArticle and a breadcrumb trail to docs pages", () => {
    const docsPage = DOCS_PAGES.find((candidatePage) => candidatePage.slug === "cli");
    if (docsPage === undefined) {
      throw new Error("missing cli page");
    }
    const [article, breadcrumbs] = docsPageJsonLd(docsPage);
    expect(article).toMatchObject({ "@type": "TechArticle", headline: "CLI" });
    expect(breadcrumbs).toMatchObject({ "@type": "BreadcrumbList" });
    expect(breadcrumbs?.itemListElement).toHaveLength(3);
  });

  it("escapes < so a value cannot close the script element", () => {
    expect(serializeJsonLd({ name: "</script><script>alert(1)</script>" })).not.toContain("<");
  });
});

describe("buildLlmsText", () => {
  it("lists every docs page with its absolute URL and the outbound links", () => {
    const llmsText = buildLlmsText(SITE_URL);
    expect(llmsText.startsWith("# krino\n")).toBe(true);
    for (const docsPage of DOCS_PAGES) {
      expect(llmsText).toContain(`[${docsPage.title}](${SITE_URL}${docsPage.href})`);
    }
    expect(llmsText).toContain(LINKS.github);
    expect(llmsText).toContain(LINKS.npm);
  });
});
