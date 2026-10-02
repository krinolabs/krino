const POSITIVE_NUMBER_PATTERN = /^\d+(\.\d+)?$/;

export type TokensPerToolParseResult =
  | { parseKind: "parsed"; tokensPerToolDefinition: number }
  | { parseKind: "invalid"; message: string };

/** `--tokens-per-tool`: a positive number of prompt tokens per tool definition. */
export function parseTokensPerTool(tokensPerToolText: string): TokensPerToolParseResult {
  const trimmedText = tokensPerToolText.trim();
  const tokensPerToolDefinition = Number(trimmedText);
  if (POSITIVE_NUMBER_PATTERN.test(trimmedText) && tokensPerToolDefinition > 0) {
    return { parseKind: "parsed", tokensPerToolDefinition };
  }
  return {
    parseKind: "invalid",
    message: `--tokens-per-tool "${tokensPerToolText}" is not a positive number (for example 175).`,
  };
}
