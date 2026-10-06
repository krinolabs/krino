import createMDX from "@next/mdx";
import type { NextConfig } from "next";

// Plugins are named by string so the options stay serializable; Turbopack needs that.
const withMDX = createMDX({
  options: {
    remarkPlugins: [["remark-gfm"]],
    rehypePlugins: [
      ["rehype-slug"],
      [
        "rehype-pretty-code",
        // The "-default" GitHub themes meet WCAG AA contrast on both canvases.
        {
          theme: { light: "github-light-default", dark: "github-dark-default" },
          keepBackground: false,
        },
      ],
    ],
  },
});

const isProduction = process.env.VERCEL_ENV === "production";

// Static pages need 'unsafe-inline' for Next's bootstrap and the theme and consent scripts.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""} https://www.googletagmanager.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://www.googletagmanager.com https://www.google-analytics.com",
  "font-src 'self'",
  "connect-src 'self' https://www.google-analytics.com https://region1.google-analytics.com https://www.googletagmanager.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: isProduction
          ? securityHeaders
          : [...securityHeaders, { key: "X-Robots-Tag", value: "noindex" }],
      },
    ];
  },
};

export default withMDX(nextConfig);
