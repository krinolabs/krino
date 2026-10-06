import type { MetadataRoute } from "next";
import { buildSitemap } from "../lib/seo";
import { SITE_URL } from "../lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return buildSitemap(SITE_URL);
}
