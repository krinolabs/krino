import Link from "next/link";
import { notFound } from "next/navigation";
import { adjacentDocsPages, DOCS_PAGES, DOCS_SECTION_NAMES, type DocsPage } from "../docs-nav";
import { DOC_CONTENT_LOADERS } from "../lib/doc-content";
import { docsPageJsonLd } from "../lib/seo";
import { JsonLd } from "./json-ld";

function DocsNavList({ currentSlug }: { currentSlug: string }) {
  return (
    <div className="flex flex-col gap-6">
      {DOCS_SECTION_NAMES.map((sectionName) => (
        <div key={sectionName}>
          <p className="text-fg-3 mb-2 font-mono text-xs font-medium lowercase">{sectionName}</p>
          <ul className="flex flex-col gap-1">
            {DOCS_PAGES.filter((docsPage) => docsPage.section === sectionName).map((docsPage) => (
              <li key={docsPage.slug}>
                <Link
                  href={docsPage.href}
                  aria-current={docsPage.slug === currentSlug ? "page" : undefined}
                  className="text-fg-3 hover:text-fg aria-[current=page]:text-fg block py-0.5 text-sm transition-colors duration-200 aria-[current=page]:font-medium"
                >
                  {docsPage.navTitle}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <Link
        href="/changelog"
        className="text-fg-3 hover:text-fg text-sm transition-colors duration-200"
      >
        Changelog
      </Link>
    </div>
  );
}

function PageLink({ docsPage, direction }: { docsPage: DocsPage; direction: "Previous" | "Next" }) {
  return (
    <Link
      href={docsPage.href}
      className={`border-hairline hover:border-hairline-strong flex flex-col gap-0.5 rounded-lg border px-4 py-3 transition-colors duration-200 ${direction === "Next" ? "items-end text-right sm:col-start-2" : ""}`}
    >
      <span className="text-fg-3 text-xs">{direction}</span>
      <span className="text-fg text-sm font-medium">{docsPage.title}</span>
    </Link>
  );
}

/** One docs page: sidebar (xl and up) or menu (below xl), title, MDX body, Previous and Next. */
export async function DocPage({ docsPage }: { docsPage: DocsPage }) {
  const loadContent = DOC_CONTENT_LOADERS.get(docsPage.slug);
  if (loadContent === undefined) {
    notFound();
  }
  const { default: DocContent } = await loadContent();
  const { previousPage, nextPage } = adjacentDocsPages(docsPage.slug);

  return (
    <div className="relative mx-auto w-full max-w-2xl px-4 pt-10 sm:px-6 sm:pt-14">
      <JsonLd data={docsPageJsonLd(docsPage)} />
      <aside className="absolute top-0 right-full mr-8 hidden h-full w-44 pt-14 xl:block">
        <nav aria-label="Docs" className="sticky top-24">
          <DocsNavList currentSlug={docsPage.slug} />
        </nav>
      </aside>

      <details className="border-hairline mb-8 rounded-lg border xl:hidden">
        <summary className="text-fg-2 cursor-pointer px-4 py-2.5 text-sm">
          <span className="text-fg-3">Docs / </span>
          {docsPage.navTitle}
        </summary>
        <nav aria-label="Docs" className="border-hairline border-t px-4 py-4">
          <DocsNavList currentSlug={docsPage.slug} />
        </nav>
      </details>

      <article>
        <header className="mb-8">
          <p className="text-fg-3 mb-2 font-mono text-xs lowercase">{docsPage.section}</p>
          <h1 className="text-fg text-2xl font-semibold tracking-tight">{docsPage.title}</h1>
          <p className="text-fg-2 mt-3 text-base leading-relaxed">{docsPage.description}</p>
        </header>
        <div className="prose-docs">
          <DocContent />
        </div>
      </article>

      {previousPage !== undefined || nextPage !== undefined ? (
        <nav aria-label="Previous and next page" className="mt-16 grid gap-3 sm:grid-cols-2">
          {previousPage !== undefined ? (
            <PageLink docsPage={previousPage} direction="Previous" />
          ) : null}
          {nextPage !== undefined ? <PageLink docsPage={nextPage} direction="Next" /> : null}
        </nav>
      ) : null}
    </div>
  );
}
