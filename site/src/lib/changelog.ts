import { readFile } from "node:fs/promises";
import nodePath from "node:path";

export type PackageChangelog = { packageName: string; markdown: string };

/** The published packages whose CHANGELOG.md (written by Changesets) the site shows. */
export const CHANGELOG_SOURCES: ReadonlyArray<{ packageName: string; relativePath: string }> = [
  { packageName: "@krinolabs/krino", relativePath: "packages/krino/CHANGELOG.md" },
  { packageName: "@krinolabs/cli", relativePath: "packages/cli/CHANGELOG.md" },
];

/**
 * Drops the `# package-name` title Changesets writes and moves every other heading down one
 * level, so versions sit under the page's per-package heading.
 */
export function prepareChangelogMarkdown(changelogText: string): string {
  const changelogLines = changelogText.split(/\r?\n/);
  const firstLine = changelogLines[0] ?? "";
  const bodyLines = /^#\s/.test(firstLine) ? changelogLines.slice(1) : changelogLines;
  let isInsideFence = false;
  return bodyLines
    .map((markdownLine) => {
      if (/^\s*(`{3,}|~{3,})/.test(markdownLine)) {
        isInsideFence = !isInsideFence;
      }
      return !isInsideFence && /^#{1,5}\s/.test(markdownLine) ? `#${markdownLine}` : markdownLine;
    })
    .join("\n")
    .trim();
}

/** Reads each package's changelog. A missing file (no release yet) is skipped. */
export async function readChangelogs(
  repositoryDirectory: string,
): Promise<Array<PackageChangelog>> {
  const changelogs: Array<PackageChangelog> = [];
  for (const changelogSource of CHANGELOG_SOURCES) {
    try {
      const changelogText = await readFile(
        // Build-time read of a known file; keep Turbopack from tracing the whole repository.
        nodePath.join(/*turbopackIgnore: true*/ repositoryDirectory, changelogSource.relativePath),
        "utf8",
      );
      const markdown = prepareChangelogMarkdown(changelogText);
      if (markdown !== "") {
        changelogs.push({ packageName: changelogSource.packageName, markdown });
      }
    } catch (readError) {
      if ((readError as NodeJS.ErrnoException).code !== "ENOENT") {
        throw readError;
      }
    }
  }
  return changelogs;
}
