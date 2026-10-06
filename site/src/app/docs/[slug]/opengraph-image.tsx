import { findDocsPage, routedDocsSlugs } from "../../../docs-nav";
import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, renderOgImage } from "../../../lib/og-image";

export const alt = "krino docs";
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;
export const dynamicParams = false;

export function generateStaticParams(): Array<{ slug: string }> {
  return routedDocsSlugs().map((slug) => ({ slug }));
}

export default async function DocsPageOpenGraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const docsPage = findDocsPage(slug);
  return renderOgImage({
    label: `Docs · ${docsPage?.section ?? "krino"}`,
    title: docsPage?.title ?? "krino docs",
  });
}
