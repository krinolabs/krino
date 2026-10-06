import { findDocsPage } from "../../docs-nav";
import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, renderOgImage } from "../../lib/og-image";

export const alt = "krino docs";
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default function DocsOpenGraphImage() {
  return renderOgImage({ label: "Docs", title: findDocsPage("introduction")?.title ?? "Docs" });
}
