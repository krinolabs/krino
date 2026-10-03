import { describe, expect, it } from "vitest";
import {
  collectImportSpecifiers,
  findForbiddenImports,
  findReachableBareImports,
  isForbiddenSpecifier,
} from "./import-graph.js";

describe("collectImportSpecifiers", () => {
  it("finds static, re-export, side-effect and dynamic imports", () => {
    const sourceText = [
      'import { a } from "./chunk-A.js";',
      'export * from "./chunk-B.js";',
      'import "side-effect";',
      'const lazy = () => import("./lazy.js");',
    ].join("\n");
    expect(collectImportSpecifiers(sourceText)).toEqual([
      "./chunk-A.js",
      "./chunk-B.js",
      "side-effect",
      "./lazy.js",
    ]);
  });

  it("ignores import text inside string literals", () => {
    const sourceText = `const snippet = 'import { generateText } from "ai";';\nexport { snippet };`;
    expect(collectImportSpecifiers(sourceText)).toEqual([]);
  });
});

describe("findReachableBareImports", () => {
  const distFiles = new Map([
    ["dist/index.js", 'import "./chunk-A.js";\nexport { b } from "./sub/chunk-B.js";'],
    ["dist/chunk-A.js", 'import { z } from "citty";\nimport "node:path";'],
    ["dist/sub/chunk-B.js", 'import { c } from "../chunk-A.js";\nimport { d } from "ai/test";'],
    ["dist/unreached.js", 'import "@anthropic-ai/claude-agent-sdk";'],
  ]);

  it("follows relative imports and reports each package import with its importer", () => {
    expect(findReachableBareImports("dist/index.js", distFiles)).toEqual([
      { specifier: "citty", importedBy: "dist/chunk-A.js" },
      { specifier: "node:path", importedBy: "dist/chunk-A.js" },
      { specifier: "ai/test", importedBy: "dist/sub/chunk-B.js" },
    ]);
  });

  it("fails when a relative import points at a file that is not in the tarball", () => {
    const brokenFiles = new Map([["dist/index.js", 'import "./missing.js";']]);
    expect(() => findReachableBareImports("dist/index.js", brokenFiles)).toThrow(
      /dist\/missing\.js/,
    );
  });
});

describe("isForbiddenSpecifier", () => {
  it("matches a package and its subpaths, not a package that only shares the prefix", () => {
    expect(isForbiddenSpecifier("ai", ["ai"])).toBe(true);
    expect(isForbiddenSpecifier("ai/test", ["ai"])).toBe(true);
    expect(isForbiddenSpecifier("aim", ["ai"])).toBe(false);
  });

  it("matches every package of a scope with @scope/*", () => {
    expect(isForbiddenSpecifier("@anthropic-ai/claude-agent-sdk", ["@anthropic-ai/*"])).toBe(true);
    expect(isForbiddenSpecifier("@anthropic-ai/sdk/resources", ["@anthropic-ai/*"])).toBe(true);
    expect(isForbiddenSpecifier("@anthropic-aix/sdk", ["@anthropic-ai/*"])).toBe(false);
  });

  it("matches one subpath entry of a package", () => {
    const forbidden = ["@krinolabs/krino/ai-sdk"];
    expect(isForbiddenSpecifier("@krinolabs/krino/ai-sdk", forbidden)).toBe(true);
    expect(isForbiddenSpecifier("@krinolabs/krino", forbidden)).toBe(false);
  });
});

describe("findForbiddenImports", () => {
  it("lists only the forbidden imports", () => {
    expect(
      findForbiddenImports(
        [
          { specifier: "citty", importedBy: "dist/index.js" },
          { specifier: "ai", importedBy: "dist/chunk-A.js" },
        ],
        ["ai", "@anthropic-ai/*"],
      ),
    ).toEqual([{ specifier: "ai", importedBy: "dist/chunk-A.js" }]);
  });
});
