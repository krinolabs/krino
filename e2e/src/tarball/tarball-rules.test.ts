import { describe, expect, it } from "vitest";
import { findUnexpectedTarballFiles, packagePathOf } from "./tarball-rules.js";

describe("packagePathOf", () => {
  it("strips the package/ folder npm and pnpm put every file in", () => {
    expect(packagePathOf("package/dist/index.js")).toBe("dist/index.js");
  });

  it("keeps a path outside package/ as it is, so the rules flag it", () => {
    expect(packagePathOf("other/index.js")).toBe("other/index.js");
  });
});

describe("findUnexpectedTarballFiles", () => {
  it("accepts dist files, README.md, LICENSE and package.json", () => {
    expect(
      findUnexpectedTarballFiles([
        "package.json",
        "README.md",
        "LICENSE",
        "dist/index.js",
        "dist/index.d.ts",
        "dist/adapters/ai-sdk/index.js",
        "dist/chunk-73W3H74Y.js",
      ]),
    ).toEqual([]);
  });

  it("flags source, tests, fixtures, snapshots and test source maps", () => {
    expect(
      findUnexpectedTarballFiles([
        "src/index.ts",
        "tsconfig.json",
        "dist/index.test.js",
        "dist/index.test.js.map",
        "dist/run.spec.js",
        "dist/__fixtures__/answer.json",
        "dist/fixtures/answer.json",
        "dist/__snapshots__/report.test.ts.snap",
        "README.md",
      ]),
    ).toEqual([
      "src/index.ts",
      "tsconfig.json",
      "dist/index.test.js",
      "dist/index.test.js.map",
      "dist/run.spec.js",
      "dist/__fixtures__/answer.json",
      "dist/fixtures/answer.json",
      "dist/__snapshots__/report.test.ts.snap",
    ]);
  });
});
