import { readdirSync } from "node:fs";
import nodePath from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  adjacentDocsPages,
  DOCS_PAGES,
  DOCS_SECTION_NAMES,
  findDocsPage,
  routedDocsSlugs,
} from "./docs-nav";
import { DOC_CONTENT_LOADERS } from "./lib/doc-content";

const DOCS_CONTENT_DIRECTORY = nodePath.resolve(
  nodePath.dirname(fileURLToPath(import.meta.url)),
  "../content/docs",
);

function contentSlugs(): Array<string> {
  return readdirSync(DOCS_CONTENT_DIRECTORY)
    .filter((fileName) => fileName.endsWith(".mdx"))
    .map((fileName) => fileName.slice(0, -".mdx".length))
    .sort();
}

describe("DOCS_PAGES", () => {
  it("has a content file for every page, and a page for every content file", () => {
    const navSlugs = DOCS_PAGES.map((docsPage) => docsPage.slug).sort();
    expect(navSlugs).toEqual(contentSlugs());
  });

  it("has a content loader for every page and no other", () => {
    const navSlugs = DOCS_PAGES.map((docsPage) => docsPage.slug).sort();
    expect([...DOC_CONTENT_LOADERS.keys()].sort()).toEqual(navSlugs);
  });

  it("uses unique slugs and hrefs", () => {
    expect(new Set(DOCS_PAGES.map((docsPage) => docsPage.slug)).size).toBe(DOCS_PAGES.length);
    expect(new Set(DOCS_PAGES.map((docsPage) => docsPage.href)).size).toBe(DOCS_PAGES.length);
  });

  it("gives every page a 50 to 160 character description", () => {
    for (const docsPage of DOCS_PAGES) {
      expect(docsPage.description.length, docsPage.slug).toBeGreaterThanOrEqual(50);
      expect(docsPage.description.length, docsPage.slug).toBeLessThanOrEqual(160);
    }
  });

  it("serves the introduction at /docs and every other page at /docs/<slug>", () => {
    for (const docsPage of DOCS_PAGES) {
      const expectedHref = docsPage.slug === "introduction" ? "/docs" : `/docs/${docsPage.slug}`;
      expect(docsPage.href).toBe(expectedHref);
    }
    expect(routedDocsSlugs()).not.toContain("introduction");
    expect(routedDocsSlugs()).toHaveLength(DOCS_PAGES.length - 1);
  });

  it("keeps each section's pages together, in section order", () => {
    const sectionOrder = DOCS_PAGES.map((docsPage) => DOCS_SECTION_NAMES.indexOf(docsPage.section));
    expect(sectionOrder).toEqual([...sectionOrder].sort((left, right) => left - right));
    expect(sectionOrder).not.toContain(-1);
  });
});

describe("findDocsPage", () => {
  it("finds a page by slug", () => {
    expect(findDocsPage("cli")?.title).toBe("CLI");
  });

  it.each(["constructor", "toString", "__proto__", "hasOwnProperty", "", "CLI"])(
    "finds nothing for %j",
    (unknownSlug) => {
      expect(findDocsPage(unknownSlug)).toBeUndefined();
    },
  );
});

describe("adjacentDocsPages", () => {
  it("has no previous page on the first page and no next page on the last", () => {
    const firstPage = DOCS_PAGES[0];
    const lastPage = DOCS_PAGES[DOCS_PAGES.length - 1];
    expect(adjacentDocsPages(firstPage?.slug ?? "").previousPage).toBeUndefined();
    expect(adjacentDocsPages(lastPage?.slug ?? "").nextPage).toBeUndefined();
  });

  it("links neighbors in reading order", () => {
    const { previousPage, nextPage } = adjacentDocsPages("install");
    expect(previousPage?.slug).toBe("introduction");
    expect(nextPage?.slug).toBe("quick-start-ai-sdk");
  });

  it("returns nothing for an unknown slug", () => {
    expect(adjacentDocsPages("__proto__")).toEqual({
      previousPage: undefined,
      nextPage: undefined,
    });
  });
});
