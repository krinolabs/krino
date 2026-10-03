import { describe, expect, it } from "vitest";
import { parsePackedManifest } from "./packed-package.js";

describe("parsePackedManifest", () => {
  it("reads name, version and dependency ranges into Maps", () => {
    const manifest = parsePackedManifest(
      JSON.stringify({
        name: "@krinolabs/cli",
        version: "0.0.0",
        dependencies: { "@krinolabs/krino": "^0.0.1", citty: "0.2.2" },
      }),
    );
    expect(manifest.name).toBe("@krinolabs/cli");
    expect([...manifest.dependencies]).toEqual([
      ["@krinolabs/krino", "^0.0.1"],
      ["citty", "0.2.2"],
    ]);
    expect(manifest.optionalDependencies.size).toBe(0);
  });

  it("keeps dependency names that collide with Object.prototype as plain names", () => {
    const manifest = parsePackedManifest(
      '{"name":"demo","version":"1.0.0","dependencies":{"constructor":"1.0.0","toString":"2.0.0","__proto__":"3.0.0"}}',
    );
    expect([...manifest.dependencies]).toEqual([
      ["constructor", "1.0.0"],
      ["toString", "2.0.0"],
      ["__proto__", "3.0.0"],
    ]);
  });

  it("drops ranges that are not strings", () => {
    const manifest = parsePackedManifest(
      '{"name":"demo","version":"1.0.0","dependencies":{"broken":7}}',
    );
    expect(manifest.dependencies.size).toBe(0);
  });

  it("rejects a manifest without a name", () => {
    expect(() => parsePackedManifest('{"version":"1.0.0"}')).toThrow(/name and version/);
  });
});
