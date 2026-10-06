export const SITE_NAME = "krino";

export const SITE_TAGLINE = "A decision layer for AI agents";

export const SITE_DESCRIPTION =
  "krino is a TypeScript decision layer that watches, prices, and safely cheapens the small decisions your AI agent makes.";

export const AUTHOR = { name: "Sushil Buragute", url: "https://sush.dev" } as const;

const DEFAULT_SITE_URL = "https://krino.sush.dev";

/** The canonical origin, without a trailing slash. Falls back to the default on a bad value. */
export function resolveSiteUrl(configuredSiteUrl: string | undefined): string {
  if (configuredSiteUrl === undefined || configuredSiteUrl.trim() === "") {
    return DEFAULT_SITE_URL;
  }
  try {
    const parsedUrl = new URL(configuredSiteUrl.trim());
    return parsedUrl.protocol === "https:" || parsedUrl.protocol === "http:"
      ? parsedUrl.origin
      : DEFAULT_SITE_URL;
  } catch {
    return DEFAULT_SITE_URL;
  }
}

export const SITE_URL = resolveSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);

export function absoluteUrl(pathname: string): string {
  return pathname === "/" ? SITE_URL : `${SITE_URL}${pathname}`;
}
