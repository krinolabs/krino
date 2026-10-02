import { describe, expect, it } from "vitest";
import { parseSince } from "./parse-since.js";

const now = new Date("2026-10-02T12:00:00.000Z");

function sinceText(text: string): string {
  const parseResult = parseSince(text, now);
  return parseResult.parseKind === "parsed" ? parseResult.since.toISOString() : "invalid";
}

describe("parseSince", () => {
  it.each([
    ["12h", "2026-10-02T00:00:00.000Z"],
    ["7d", "2026-09-25T12:00:00.000Z"],
    ["2w", "2026-09-18T12:00:00.000Z"],
    [" 1d ", "2026-10-01T12:00:00.000Z"],
    ["2026-09-01", "2026-09-01T00:00:00.000Z"],
    ["2026-09-01T08:30:00Z", "2026-09-01T08:30:00.000Z"],
  ])("%j starts at %s", (text, expectedSince) => {
    expect(sinceText(text)).toBe(expectedSince);
  });

  it.each(["", "7", "7y", "-1d", "yesterday", "2026-13-45", "constructor"])(
    "rejects %j",
    (text) => {
      const parseResult = parseSince(text, now);
      expect(parseResult.parseKind).toBe("invalid");
    },
  );
});
