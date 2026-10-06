import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, renderOgImage } from "../lib/og-image";

export const alt =
  "krino: watch, price, and safely cheapen the small decisions your AI agent makes.";
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default function OpenGraphImage() {
  return renderOgImage({
    label: "TypeScript · Vercel AI SDK · Claude Agent SDK",
    title: "Watch, price, and safely cheapen the small decisions your AI agent makes.",
  });
}
