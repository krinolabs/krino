import { readdirSync, readFileSync } from "node:fs";
import nodePath from "node:path";
import { fileURLToPath } from "node:url";
import { KRINO_CONFIG_DEFAULTS } from "@krinolabs/krino";
import { describe, expect, it } from "vitest";
import { indexableRoutes } from "./lib/seo";

const CONTENT_DIRECTORY = nodePath.resolve(
  nodePath.dirname(fileURLToPath(import.meta.url)),
  "../content",
);

function readContentFiles(): Array<{ relativePath: string; text: string }> {
  return readdirSync(CONTENT_DIRECTORY, { recursive: true, encoding: "utf8" })
    .filter((relativePath) => relativePath.endsWith(".mdx"))
    .map((relativePath) => ({
      relativePath,
      text: readFileSync(nodePath.join(CONTENT_DIRECTORY, relativePath), "utf8"),
    }));
}

describe("site content", () => {
  it("has no unfinished placeholders", () => {
    for (const contentFile of readContentFiles()) {
      expect(contentFile.text, contentFile.relativePath).not.toMatch(/\[(BENCH|VERIFY)\b/);
      expect(contentFile.text, contentFile.relativePath).not.toMatch(/\bTODO:/);
    }
  });

  it("links only to routes that exist", () => {
    const knownRoutes = new Set(indexableRoutes());
    for (const contentFile of readContentFiles()) {
      for (const linkMatch of contentFile.text.matchAll(/\]\((\/[^)#\s]*)/g)) {
        expect(
          knownRoutes.has(linkMatch[1] ?? ""),
          `${contentFile.relativePath}: ${linkMatch[1]}`,
        ).toBe(true);
      }
    }
  });

  it("does not start a docs page with its own h1; the template renders the title", () => {
    for (const contentFile of readContentFiles()) {
      expect(contentFile.text, contentFile.relativePath).not.toMatch(/^# /m);
    }
  });
});

describe("configuration page", () => {
  const configurationText = readFileSync(
    nodePath.join(CONTENT_DIRECTORY, "docs", "configuration.mdx"),
    "utf8",
  );

  it("names every key of KRINO_CONFIG_DEFAULTS", () => {
    for (const configKey of Object.keys(KRINO_CONFIG_DEFAULTS)) {
      expect(configurationText).toContain(`\`${configKey}\``);
    }
  });

  it("shows every numeric and boolean default as krino defines it", () => {
    for (const [configKey, defaultValue] of Object.entries(KRINO_CONFIG_DEFAULTS)) {
      if (typeof defaultValue === "number" || typeof defaultValue === "boolean") {
        expect(configurationText, configKey).toContain(
          `| \`${configKey}\` | \`${String(defaultValue)}\` |`,
        );
      }
    }
  });

  it("documents shadow as the default mode for every decision", () => {
    const defaultModes = Object.values(KRINO_CONFIG_DEFAULTS.decisionModes);
    expect(defaultModes).toHaveLength(3);
    expect(defaultModes.every((decisionMode) => decisionMode === "shadow")).toBe(true);
    expect(configurationText).toContain("| `decisionModes` | every decision `shadow` |");
  });
});
