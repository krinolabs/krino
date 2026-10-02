import { describe, expect, it } from "vitest";
import { renderBanner } from "../banner/krino-banner.js";
import { decorateUsage } from "../main-command.js";
import { createTextStyle, PLAIN_STYLE, supportsColor } from "./text-style.js";

describe("supportsColor", () => {
  it("allows color only at a terminal without NO_COLOR", () => {
    expect(supportsColor({ environment: {}, isTerminal: true })).toBe(true);
    expect(supportsColor({ environment: {}, isTerminal: false })).toBe(false);
    expect(supportsColor({ environment: {}, isTerminal: undefined })).toBe(false);
    expect(supportsColor({ environment: { NO_COLOR: "1" }, isTerminal: true })).toBe(false);
  });

  it("ignores an empty NO_COLOR, as no-color.org says", () => {
    expect(supportsColor({ environment: { NO_COLOR: "" }, isTerminal: true })).toBe(true);
  });
});

describe("banner", () => {
  it("is plain text with the plain style", () => {
    expect(renderBanner(PLAIN_STYLE)).toEqual(["krino · decision layer for AI agents"]);
  });

  it("adds ANSI colors only with the color style", () => {
    expect(renderBanner(createTextStyle(true)).join("")).toContain("\u001b[");
    expect(renderBanner(createTextStyle(false)).join("")).not.toContain("\u001b[");
  });
});

describe("decorateUsage", () => {
  const coloredUsage = "\u001b[36mkrino report\u001b[39m";

  it("puts the banner on top at a terminal", () => {
    const usageText = decorateUsage(coloredUsage, { environment: {}, isTerminal: true });
    expect(usageText).toContain("decision layer for AI agents");
    expect(usageText).toContain(coloredUsage);
  });

  it("strips colors with NO_COLOR but keeps the banner at a terminal", () => {
    expect(decorateUsage(coloredUsage, { environment: { NO_COLOR: "1" }, isTerminal: true })).toBe(
      "krino · decision layer for AI agents\n\nkrino report\n",
    );
  });

  it("prints only plain usage when stdout is not a terminal", () => {
    expect(decorateUsage(coloredUsage, { environment: {}, isTerminal: false })).toBe(
      "krino report\n",
    );
  });
});
