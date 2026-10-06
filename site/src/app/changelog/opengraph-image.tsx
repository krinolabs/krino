import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, renderOgImage } from "../../lib/og-image";
import { CHANGELOG_PAGE } from "../../lib/seo";

export const alt = "krino changelog";
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default function ChangelogOpenGraphImage() {
  return renderOgImage({ label: "Release notes", title: CHANGELOG_PAGE.title });
}
