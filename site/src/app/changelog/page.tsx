import nodePath from "node:path";
import { evaluate } from "@mdx-js/mdx";
import type { Metadata } from "next";
import * as jsxRuntime from "react/jsx-runtime";
import remarkGfm from "remark-gfm";
import { readChangelogs } from "../../lib/changelog";
import { CHANGELOG_PAGE, pageMetadata } from "../../lib/seo";
import { LINKS } from "../../links";

export const metadata: Metadata = pageMetadata(CHANGELOG_PAGE);

// `next build` runs in site/, so the packages are one level up.
const REPOSITORY_DIRECTORY = nodePath.resolve(/*turbopackIgnore: true*/ process.cwd(), "..");

async function renderMarkdown(markdown: string) {
  // format "md" reads plain Markdown: no JSX or expressions in release notes are executed.
  const { default: ChangelogContent } = await evaluate(markdown, {
    ...jsxRuntime,
    format: "md",
    remarkPlugins: [remarkGfm],
  });
  return <ChangelogContent />;
}

export default async function ChangelogPage() {
  const changelogs = await readChangelogs(REPOSITORY_DIRECTORY);
  const renderedChangelogs = await Promise.all(
    changelogs.map(async (changelog) => ({
      packageName: changelog.packageName,
      content: await renderMarkdown(changelog.markdown),
    })),
  );

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-10 sm:px-6 sm:pt-14">
      <header className="mb-8">
        <h1 className="text-fg text-2xl font-semibold tracking-tight">{CHANGELOG_PAGE.title}</h1>
        <p className="text-fg-2 mt-3 text-base leading-relaxed">
          Release notes for each package, newest first.
        </p>
      </header>
      {renderedChangelogs.length === 0 ? (
        <p className="text-fg-2">
          No release notes yet. Follow{" "}
          <a
            href={LINKS.github}
            data-outbound="github"
            className="text-fg underline underline-offset-3"
          >
            the repository
          </a>{" "}
          for the first release.
        </p>
      ) : (
        renderedChangelogs.map((renderedChangelog) => (
          <section key={renderedChangelog.packageName} className="prose-docs mb-12">
            <h2>
              <code>{renderedChangelog.packageName}</code>
            </h2>
            {renderedChangelog.content}
          </section>
        ))
      )}
    </div>
  );
}
