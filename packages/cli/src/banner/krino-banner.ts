import type { TextStyle } from "../terminal/text-style.js";

// PLACEHOLDER: the brand pack banner (docs/brand/cli/krino-banner.ts) is not in the repo yet.
// Replace these lines with the brand pack's banner when it lands; keep `renderBanner`'s signature.
const BANNER_TITLE = "krino";
const BANNER_TAGLINE = "decision layer for AI agents";

/** The banner, one line per entry. Plain text unless the style adds color. */
export function renderBanner(textStyle: TextStyle): Array<string> {
  return [
    `${textStyle.bold(textStyle.accent(BANNER_TITLE))} ${textStyle.dim(`· ${BANNER_TAGLINE}`)}`,
  ];
}
