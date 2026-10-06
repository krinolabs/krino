import type { MetadataRoute } from "next";
import { buildRobots } from "../lib/seo";
import { SITE_URL } from "../lib/site";

export default function robots(): MetadataRoute.Robots {
  return buildRobots(SITE_URL, process.env.VERCEL_ENV === "production");
}
