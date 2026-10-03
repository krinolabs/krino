import { describe, expect, it } from "vitest";
import { findUncoveredExports, publicEntrySpecifiers } from "./public-exports.js";

describe("publicEntrySpecifiers", () => {
  it("maps the exports map to import specifiers, without ./package.json", () => {
    expect(
      publicEntrySpecifiers("@krinolabs/krino", [
        ".",
        "./ai-sdk",
        "./providers/jev",
        "./package.json",
      ]),
    ).toEqual(["@krinolabs/krino", "@krinolabs/krino/ai-sdk", "@krinolabs/krino/providers/jev"]);
  });
});

describe("findUncoveredExports", () => {
  it("lists exported names the consumer does not import", () => {
    expect(
      findUncoveredExports([
        { specifier: "a", exportedNames: ["one", "two"], importedNames: ["one", "two"] },
        { specifier: "b", exportedNames: ["three", "four"], importedNames: ["three"] },
      ]),
    ).toEqual([{ specifier: "b", missingNames: ["four"] }]);
  });
});
