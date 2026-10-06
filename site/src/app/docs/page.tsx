import type { Metadata } from "next";
import { DocPage } from "../../components/doc-page";
import { type DocsPage, findDocsPage } from "../../docs-nav";
import { pageMetadata } from "../../lib/seo";

function introductionPage(): DocsPage {
  const docsPage = findDocsPage("introduction");
  if (docsPage === undefined) {
    throw new Error("DOCS_PAGES has no introduction page.");
  }
  return docsPage;
}

export const metadata: Metadata = pageMetadata(introductionPage());

export default function DocsIntroductionPage() {
  return <DocPage docsPage={introductionPage()} />;
}
