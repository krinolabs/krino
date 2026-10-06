export type DocsSectionName = "Get started" | "Use krino" | "Background";

export type DocsPage = {
  /** File name in content/docs, without `.mdx`. */
  slug: string;
  href: string;
  title: string;
  /** Shorter label for the sidebar. */
  navTitle: string;
  /** Meta description: 50 to 160 characters. */
  description: string;
  section: DocsSectionName;
};

/** The docs in reading order. This array is the sidebar, the sitemap, and the Next links. */
export const DOCS_PAGES: ReadonlyArray<DocsPage> = [
  {
    slug: "introduction",
    href: "/docs",
    title: "Introduction",
    navTitle: "Introduction",
    description:
      "What krino is, who it is for, and how it makes the small decisions your AI agent takes cheaper without changing what your agent does.",
    section: "Get started",
  },
  {
    slug: "install",
    href: "/docs/install",
    title: "Install",
    navTitle: "Install",
    description:
      "Install krino and its CLI, then add the host SDK you use: the Vercel AI SDK or the Claude Agent SDK. Needs Node 22 or later.",
    section: "Get started",
  },
  {
    slug: "quick-start-ai-sdk",
    href: "/docs/quick-start-ai-sdk",
    title: "Quick start: Vercel AI SDK",
    navTitle: "Vercel AI SDK",
    description:
      "Add krino to a Vercel AI SDK agent in shadow mode, run it, and read your first cost report. Step by step, in about five minutes.",
    section: "Get started",
  },
  {
    slug: "quick-start-claude-agent-sdk",
    href: "/docs/quick-start-claude-agent-sdk",
    title: "Quick start: Claude Agent SDK",
    navTitle: "Claude Agent SDK",
    description:
      "Add krino to a Claude Agent SDK agent in shadow mode, run it, and read your first cost report. Step by step, in about five minutes.",
    section: "Get started",
  },
  {
    slug: "shadow-report-enforce",
    href: "/docs/shadow-report-enforce",
    title: "Shadow, report, enforce",
    navTitle: "Shadow, report, enforce",
    description:
      "The safe path to a cheaper agent: record decisions in shadow mode, read the report, then enforce tool selection when the data agrees.",
    section: "Use krino",
  },
  {
    slug: "cli",
    href: "/docs/cli",
    title: "CLI",
    navTitle: "CLI",
    description:
      "Reference for krino init, krino report, and krino doctor: what each command does, its options, where it reads traces, and its exit codes.",
    section: "Use krino",
  },
  {
    slug: "configuration",
    href: "/docs/configuration",
    title: "Configuration",
    navTitle: "Configuration",
    description:
      "Every createKrino option and its default, the three decision modes, the risk gate policy, decision providers, traces, and prices.",
    section: "Use krino",
  },
  {
    slug: "how-it-works",
    href: "/docs/how-it-works",
    title: "How it works",
    navTitle: "How it works",
    description:
      "Why tool selection fails open, why the risk gate fails closed, why tools change only at step 0, and how krino records traces and costs.",
    section: "Background",
  },
  {
    slug: "limitations",
    href: "/docs/limitations",
    title: "Limitations",
    navTitle: "Limitations",
    description:
      "What krino v0.1 does not do yet: TypeScript only, run-start selection on the Claude Agent SDK, a shadow-only risk gate, and local traces.",
    section: "Background",
  },
  {
    slug: "benchmark",
    href: "/docs/benchmark",
    title: "Benchmark",
    navTitle: "Benchmark",
    description:
      "How krino measures tool selection: the same agent in three setups, scored on recall and on cost per step with prompt-cache tokens included.",
    section: "Background",
  },
];

export const DOCS_SECTION_NAMES: ReadonlyArray<DocsSectionName> = [
  "Get started",
  "Use krino",
  "Background",
];

const DOCS_PAGES_BY_SLUG: ReadonlyMap<string, DocsPage> = new Map(
  DOCS_PAGES.map((docsPage) => [docsPage.slug, docsPage]),
);

/** Looks a page up by slug. A Map, so `constructor` or `__proto__` find nothing. */
export function findDocsPage(slug: string): DocsPage | undefined {
  return DOCS_PAGES_BY_SLUG.get(slug);
}

/** Slugs served by /docs/[slug]; the introduction lives at /docs. */
export function routedDocsSlugs(): Array<string> {
  return DOCS_PAGES.filter((docsPage) => docsPage.href !== "/docs").map(
    (docsPage) => docsPage.slug,
  );
}

export function adjacentDocsPages(slug: string): {
  previousPage: DocsPage | undefined;
  nextPage: DocsPage | undefined;
} {
  const pageIndex = DOCS_PAGES.findIndex((docsPage) => docsPage.slug === slug);
  if (pageIndex === -1) {
    return { previousPage: undefined, nextPage: undefined };
  }
  return { previousPage: DOCS_PAGES[pageIndex - 1], nextPage: DOCS_PAGES[pageIndex + 1] };
}
