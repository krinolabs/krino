import type { LanguageModelUsage, ProviderMetadata } from "ai";
import type { TokenUsageRecord } from "../../contracts/index.js";

// Verified against ai 7.0.126: `usage.inputTokens` is the provider's input total, which for
// Anthropic includes cache reads and cache writes. `inputTokenDetails.noCacheTokens` is the
// uncached part (Anthropic's `input_tokens`). krino's `inputTokens` must exclude cache tokens,
// or cost math bills them twice.

export const EMPTY_TOKEN_USAGE: TokenUsageRecord = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

/** Anthropic's own usage field names, read from `usage.raw` when the details are missing. */
const RAW_CACHE_READ_KEY = "cache_read_input_tokens";
const RAW_CACHE_WRITE_KEY = "cache_creation_input_tokens";
const ANTHROPIC_METADATA_KEY = "anthropic";
const ANTHROPIC_CACHE_WRITE_METADATA_KEY = "cacheCreationInputTokens";

function tokenCountOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/** An own property of external data, or `undefined`. Never reads the prototype chain. */
function ownValue(container: unknown, key: string): unknown {
  if (typeof container !== "object" || container === null || !Object.hasOwn(container, key)) {
    return undefined;
  }
  return (container as Record<string, unknown>)[key];
}

function anthropicCacheWriteFromMetadata(
  providerMetadata: ProviderMetadata | undefined,
): number | null {
  const anthropicMetadata = ownValue(providerMetadata, ANTHROPIC_METADATA_KEY);
  return tokenCountOrNull(ownValue(anthropicMetadata, ANTHROPIC_CACHE_WRITE_METADATA_KEY));
}

/** One step's usage in krino's shape: `inputTokens` excludes cache reads and cache writes. */
export function tokenUsageFromStep(
  stepUsage: LanguageModelUsage,
  providerMetadata: ProviderMetadata | undefined,
): TokenUsageRecord {
  const cacheReadTokens =
    tokenCountOrNull(stepUsage.inputTokenDetails?.cacheReadTokens) ??
    tokenCountOrNull(ownValue(stepUsage.raw, RAW_CACHE_READ_KEY)) ??
    0;
  const cacheWriteTokens =
    tokenCountOrNull(stepUsage.inputTokenDetails?.cacheWriteTokens) ??
    tokenCountOrNull(ownValue(stepUsage.raw, RAW_CACHE_WRITE_KEY)) ??
    anthropicCacheWriteFromMetadata(providerMetadata) ??
    0;
  const totalInputTokens = tokenCountOrNull(stepUsage.inputTokens) ?? 0;
  const inputTokens =
    tokenCountOrNull(stepUsage.inputTokenDetails?.noCacheTokens) ??
    Math.max(0, totalInputTokens - cacheReadTokens - cacheWriteTokens);
  return {
    inputTokens,
    outputTokens: tokenCountOrNull(stepUsage.outputTokens) ?? 0,
    cacheReadTokens,
    cacheWriteTokens,
  };
}

export function addTokenUsage(
  leftUsage: TokenUsageRecord,
  rightUsage: TokenUsageRecord,
): TokenUsageRecord {
  return {
    inputTokens: leftUsage.inputTokens + rightUsage.inputTokens,
    outputTokens: leftUsage.outputTokens + rightUsage.outputTokens,
    cacheReadTokens: leftUsage.cacheReadTokens + rightUsage.cacheReadTokens,
    cacheWriteTokens: leftUsage.cacheWriteTokens + rightUsage.cacheWriteTokens,
  };
}
