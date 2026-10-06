import { buildLlmsText } from "../../lib/seo";
import { SITE_URL } from "../../lib/site";

export const dynamic = "force-static";

export function GET(): Response {
  return new Response(buildLlmsText(SITE_URL), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
