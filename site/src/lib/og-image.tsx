import { readFile } from "node:fs/promises";
import nodePath from "node:path";
import { ImageResponse } from "next/og";

export const OG_IMAGE_SIZE = { width: 1200, height: 630 } as const;

export const OG_IMAGE_CONTENT_TYPE = "image/png";

// Satori reads TTF, not WOFF2, so the cards use the TTF files that ship in `geist`.
const GEIST_FONT_DIRECTORY = nodePath.join(
  /*turbopackIgnore: true*/ process.cwd(),
  "node_modules",
  "geist",
  "dist",
  "fonts",
);

async function loadOgFonts() {
  const [sansMedium, sansSemiBold, monoMedium] = await Promise.all([
    readFile(nodePath.join(GEIST_FONT_DIRECTORY, "geist-sans", "Geist-Medium.ttf")),
    readFile(nodePath.join(GEIST_FONT_DIRECTORY, "geist-sans", "Geist-SemiBold.ttf")),
    readFile(nodePath.join(GEIST_FONT_DIRECTORY, "geist-mono", "GeistMono-Medium.ttf")),
  ]);
  return [
    { name: "Geist", data: sansMedium, weight: 500 as const, style: "normal" as const },
    { name: "Geist", data: sansSemiBold, weight: 600 as const, style: "normal" as const },
    { name: "Geist Mono", data: monoMedium, weight: 500 as const, style: "normal" as const },
  ];
}

/** The dark sush.dev card: wordmark, a small label, the page title, and a glacier glow. */
export async function renderOgImage({
  label,
  title,
}: {
  label: string;
  title: string;
}): Promise<ImageResponse> {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px 80px",
        backgroundColor: "#0b0f14",
        backgroundImage:
          "radial-gradient(ellipse 90% 60% at 30% -10%, rgba(88, 193, 228, 0.22), rgba(11, 15, 20, 0) 70%), radial-gradient(ellipse 60% 40% at 80% 10%, rgba(216, 181, 121, 0.12), rgba(11, 15, 20, 0) 70%)",
        color: "#e9eef2",
        fontFamily: "Geist",
      }}
    >
      <div style={{ display: "flex", fontFamily: "Geist Mono", fontSize: 30 }}>
        <span style={{ color: "#6b7782" }}>{"// "}</span>
        <span>krino</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "flex", fontFamily: "Geist Mono", fontSize: 26, color: "#7ed6f1" }}>
          {label}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 64,
            fontWeight: 600,
            lineHeight: 1.12,
            letterSpacing: "-0.02em",
            maxWidth: 1000,
          }}
        >
          {title}
        </div>
      </div>
      <div style={{ display: "flex", fontSize: 26, color: "#8b97a2" }}>
        A decision layer for AI agents · krino.sush.dev
      </div>
    </div>,
    { ...OG_IMAGE_SIZE, fonts: await loadOgFonts() },
  );
}
