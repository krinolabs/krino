import { describe, expect, it } from "vitest";
import {
  compileCodeBlocks,
  extractTypeScriptBlocks,
  listSiteContentPaths,
  README_PATHS,
  readReadmeBlocks,
} from "./readme-snippets.js";

describe("extractTypeScriptBlocks", () => {
  it("returns ts and typescript blocks with their first code line, and skips other languages", () => {
    const markdownText = [
      "# Title", // 1
      "```sh", // 2
      "npm i @krinolabs/krino", // 3
      "```", // 4
      "```ts", // 5
      "const first = 1;", // 6
      "```", // 7
      "", // 8
      "```typescript", // 9
      "const second = 2;", // 10
      "const third = 3;", // 11
      "```", // 12
      "```json", // 13
      '{ "ts": true }', // 14
      "```", // 15
    ].join("\n");

    expect(extractTypeScriptBlocks(markdownText, "README.md")).toEqual([
      { sourcePath: "README.md", firstLine: 6, code: "const first = 1;" },
      { sourcePath: "README.md", firstLine: 10, code: "const second = 2;\nconst third = 3;" },
    ]);
  });

  it("does not read a ts fence inside another fence as a block", () => {
    const markdownText = ["````md", "```ts", "const inner = 1;", "```", "````"].join("\n");

    expect(extractTypeScriptBlocks(markdownText, "README.md")).toEqual([]);
  });
});

describe("compileCodeBlocks", () => {
  it("reports a type error at its line in the Markdown file", () => {
    const diagnostics = compileCodeBlocks([
      {
        sourcePath: "README.md",
        firstLine: 20,
        code: "const count: number = 1;\nconst name: string = count;",
      },
    ]);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatch(/^README\.md:21: TS2322 /);
  });

  it("reports an export that krino does not have", () => {
    const diagnostics = compileCodeBlocks([
      {
        sourcePath: "README.md",
        firstLine: 1,
        code: 'import { notAnExport } from "@krinolabs/krino";',
      },
    ]);

    expect(diagnostics.join("\n")).toMatch(/^README\.md:1: TS2305 /);
  });

  it("keeps blocks apart: two blocks may declare the same name", () => {
    const codeBlock = { sourcePath: "README.md", firstLine: 1, code: "const krino = 1;" };

    expect(compileCodeBlocks([codeBlock, { ...codeBlock, firstLine: 9 }])).toEqual([]);
  });
});

describe("README code blocks", () => {
  const readmeBlocks = readReadmeBlocks();

  it("finds the quick starts in every README that has them", () => {
    const blockCountByPath = new Map(README_PATHS.map((readmePath) => [readmePath, 0]));
    for (const codeBlock of readmeBlocks) {
      blockCountByPath.set(
        codeBlock.sourcePath,
        (blockCountByPath.get(codeBlock.sourcePath) ?? 0) + 1,
      );
    }

    expect(blockCountByPath.get("README.md")).toBeGreaterThanOrEqual(2);
    expect(blockCountByPath.get("packages/krino/README.md")).toBeGreaterThanOrEqual(2);
  });

  it("includes the website's MDX pages and their quick starts", () => {
    const siteContentPaths = listSiteContentPaths();
    expect(siteContentPaths).toContain("site/content/docs/quick-start-ai-sdk.mdx");
    expect(siteContentPaths).toContain("site/content/docs/quick-start-claude-agent-sdk.mdx");
    const blockSourcePaths = new Set(readmeBlocks.map((codeBlock) => codeBlock.sourcePath));
    expect(blockSourcePaths.has("site/content/docs/quick-start-ai-sdk.mdx")).toBe(true);
    expect(blockSourcePaths.has("site/content/docs/quick-start-claude-agent-sdk.mdx")).toBe(true);
    expect(blockSourcePaths.has("site/content/home/quick-look.mdx")).toBe(true);
  });

  it("compiles every TypeScript block against the built packages", () => {
    expect(compileCodeBlocks(readmeBlocks)).toEqual([]);
  });
});
