import { describe, expect, it } from "vitest";
import { LINKS } from "../links";
import { AUTHOR, resolveSiteUrl } from "./site";

describe("resolveSiteUrl", () => {
  it("defaults to krino.sush.dev", () => {
    expect(resolveSiteUrl(undefined)).toBe("https://krino.sush.dev");
    expect(resolveSiteUrl("  ")).toBe("https://krino.sush.dev");
  });

  it("keeps only the origin of a configured URL", () => {
    expect(resolveSiteUrl("https://preview.example.com/")).toBe("https://preview.example.com");
    expect(resolveSiteUrl("http://localhost:3000/docs")).toBe("http://localhost:3000");
  });

  it.each(["not a url", "javascript:alert(1)", "ftp://krino.sush.dev"])(
    "falls back on %j",
    (configuredSiteUrl) => {
      expect(resolveSiteUrl(configuredSiteUrl)).toBe("https://krino.sush.dev");
    },
  );
});

describe("links", () => {
  it("points at the repository, the npm package, and the portfolio", () => {
    expect(LINKS).toEqual({
      github: "https://github.com/krinolabs/krino",
      npm: "https://www.npmjs.com/package/@krinolabs/krino",
      portfolio: "https://sush.dev",
    });
    expect(AUTHOR.url).toBe(LINKS.portfolio);
  });
});
