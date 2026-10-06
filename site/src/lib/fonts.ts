import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import localFont from "next/font/local";

export const geistSans = GeistSans;
export const geistMono = GeistMono;

// The package's pixel entry loads all five pixel faces. The wordmark needs only Square.
export const geistPixelSquare = localFont({
  src: "../../node_modules/geist/dist/fonts/geist-pixel/GeistPixel-Square.woff2",
  variable: "--font-geist-pixel-square",
  weight: "500",
  display: "swap",
  fallback: ["Geist Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
  adjustFontFallback: false,
});
