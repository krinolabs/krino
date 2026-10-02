import { describe, expect, it } from "vitest";
import { parseTokensPerTool } from "./parse-tokens-per-tool.js";

describe("parseTokensPerTool", () => {
  it.each([
    ["175", 175],
    [" 80 ", 80],
    ["120.5", 120.5],
  ])("reads %j as %d", (tokensPerToolText, tokensPerToolDefinition) => {
    expect(parseTokensPerTool(tokensPerToolText)).toEqual({
      parseKind: "parsed",
      tokensPerToolDefinition,
    });
  });

  it.each(["", "0", "-5", "abc", "1e3", "Infinity", "constructor"])("rejects %j", (text) => {
    expect(parseTokensPerTool(text).parseKind).toBe("invalid");
  });
});
