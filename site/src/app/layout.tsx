import type { Metadata, Viewport } from "next";
import Script from "next/script";
import type { ReactNode } from "react";
import { AnalyticsConsent } from "../components/analytics-consent";
import { SiteFooter } from "../components/site-footer";
import { SiteHeader } from "../components/site-header";
import { consentBootstrapScript, resolveMeasurementId } from "../lib/consent";
import { geistMono, geistPixelSquare, geistSans } from "../lib/fonts";
import { AUTHOR, SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SITE_URL } from "../lib/site";
import { THEME_INIT_SCRIPT } from "../lib/theme-script";
import "../styles/globals.css";

const DEFAULT_TITLE = `${SITE_NAME}: ${SITE_TAGLINE}`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: DEFAULT_TITLE, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: AUTHOR.name, url: AUTHOR.url }],
  creator: AUTHOR.name,
  keywords: [
    "krino",
    "AI agents",
    "tool selection",
    "LLM cost",
    "prompt caching",
    "Vercel AI SDK",
    "Claude Agent SDK",
    "TypeScript",
  ],
  alternates: { canonical: SITE_URL },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_US",
    url: SITE_URL,
    title: DEFAULT_TITLE,
    description: SITE_DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: DEFAULT_TITLE, description: SITE_DESCRIPTION },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f9fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0f14" },
  ],
};

const measurementId = resolveMeasurementId(
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
  process.env.VERCEL_ENV,
);

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${geistPixelSquare.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: constant pre-paint theme script.
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
        {measurementId !== undefined ? (
          <script
            // biome-ignore lint/security/noDangerouslySetInnerHtml: consent defaults must run before gtag.js; the id is validated.
            dangerouslySetInnerHTML={{ __html: consentBootstrapScript(measurementId) }}
          />
        ) : null}
      </head>
      <body className="flex min-h-dvh flex-col">
        <a
          href="#content"
          className="bg-surface text-fg sr-only z-50 rounded-md px-3 py-2 text-sm focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Skip to content
        </a>
        <SiteHeader />
        <main id="content" className="relative w-full grow">
          {children}
        </main>
        <SiteFooter isAnalyticsEnabled={measurementId !== undefined} />
        {measurementId !== undefined ? (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
              strategy="afterInteractive"
            />
            <AnalyticsConsent />
          </>
        ) : null}
      </body>
    </html>
  );
}
