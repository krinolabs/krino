import type { MDXContent } from "mdx/types";

type DocModule = { default: MDXContent };

/** One loader per page in DOCS_PAGES. Static imports, so the bundler sees every file. */
export const DOC_CONTENT_LOADERS: ReadonlyMap<string, () => Promise<DocModule>> = new Map([
  ["introduction", () => import("../../content/docs/introduction.mdx")],
  ["install", () => import("../../content/docs/install.mdx")],
  ["quick-start-ai-sdk", () => import("../../content/docs/quick-start-ai-sdk.mdx")],
  [
    "quick-start-claude-agent-sdk",
    () => import("../../content/docs/quick-start-claude-agent-sdk.mdx"),
  ],
  ["shadow-report-enforce", () => import("../../content/docs/shadow-report-enforce.mdx")],
  ["cli", () => import("../../content/docs/cli.mdx")],
  ["configuration", () => import("../../content/docs/configuration.mdx")],
  ["how-it-works", () => import("../../content/docs/how-it-works.mdx")],
  ["limitations", () => import("../../content/docs/limitations.mdx")],
  ["benchmark", () => import("../../content/docs/benchmark.mdx")],
]);
