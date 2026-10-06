import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import nodePath from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { prepareChangelogMarkdown, readChangelogs } from "./changelog";

describe("prepareChangelogMarkdown", () => {
  it("drops the package title and moves every heading down one level", () => {
    const changelogText = [
      "# @krinolabs/krino",
      "",
      "## 0.1.0",
      "",
      "### Minor Changes",
      "",
      "- abc1234: First release.",
    ].join("\n");
    expect(prepareChangelogMarkdown(changelogText)).toBe(
      ["### 0.1.0", "", "#### Minor Changes", "", "- abc1234: First release."].join("\n"),
    );
  });

  it("leaves lines inside code fences alone", () => {
    const changelogText = [
      "# @krinolabs/cli",
      "## 0.1.0",
      "```sh",
      "# a shell comment",
      "```",
    ].join("\n");
    expect(prepareChangelogMarkdown(changelogText)).toBe(
      ["### 0.1.0", "```sh", "# a shell comment", "```"].join("\n"),
    );
  });
});

describe("readChangelogs", () => {
  let repositoryDirectory = "";

  afterEach(() => {
    rmSync(repositoryDirectory, { recursive: true, force: true });
  });

  it("skips packages that have no changelog yet", async () => {
    repositoryDirectory = mkdtempSync(nodePath.join(tmpdir(), "krino-site-changelog-"));
    expect(await readChangelogs(repositoryDirectory)).toEqual([]);
  });

  it("reads the changelogs that exist, in package order", async () => {
    repositoryDirectory = mkdtempSync(nodePath.join(tmpdir(), "krino-site-changelog-"));
    mkdirSync(nodePath.join(repositoryDirectory, "packages", "cli"), { recursive: true });
    writeFileSync(
      nodePath.join(repositoryDirectory, "packages", "cli", "CHANGELOG.md"),
      "# @krinolabs/cli\n\n## 0.1.0\n\n- First release.\n",
    );
    expect(await readChangelogs(repositoryDirectory)).toEqual([
      { packageName: "@krinolabs/cli", markdown: "### 0.1.0\n\n- First release." },
    ]);
  });
});
