import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocPage } from "../../../components/doc-page";
import { findDocsPage, routedDocsSlugs } from "../../../docs-nav";
import { pageMetadata } from "../../../lib/seo";

type DocsRouteProps = { params: Promise<{ slug: string }> };

// Every page is built ahead of time; any other slug is a 404.
export const dynamicParams = false;

export function generateStaticParams(): Array<{ slug: string }> {
  return routedDocsSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: DocsRouteProps): Promise<Metadata> {
  const { slug } = await params;
  const docsPage = findDocsPage(slug);
  return docsPage === undefined ? {} : pageMetadata(docsPage);
}

export default async function DocsRoutePage({ params }: DocsRouteProps) {
  const { slug } = await params;
  const docsPage = findDocsPage(slug);
  if (docsPage === undefined || docsPage.href === "/docs") {
    notFound();
  }
  return <DocPage docsPage={docsPage} />;
}
