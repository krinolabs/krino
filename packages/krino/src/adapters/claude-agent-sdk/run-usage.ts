import type { TokenUsageRecord } from "../../contracts/index.js";

// Reads the result message's `modelUsage` (per-model totals for every model call in the run).
// The keys are model names from outside, so it only walks own entries and never indexes by them.

type ModelTokenCounts = TokenUsageRecord;

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

/** A finite, non-negative count from an SDK usage entry; anything else counts as 0. */
function tokenCount(usageEntry: object, fieldName: string): number {
  if (!Object.hasOwn(usageEntry, fieldName)) {
    return 0;
  }
  const fieldValue: unknown = Reflect.get(usageEntry, fieldName);
  return typeof fieldValue === "number" && Number.isFinite(fieldValue) && fieldValue >= 0
    ? fieldValue
    : 0;
}

function modelTokenCounts(modelUsage: unknown): Array<[string, ModelTokenCounts]> {
  if (!isObject(modelUsage)) {
    return [];
  }
  return Object.entries(modelUsage).flatMap(([modelName, usageEntry]: [string, unknown]) =>
    isObject(usageEntry)
      ? [
          [
            modelName,
            {
              inputTokens: tokenCount(usageEntry, "inputTokens"),
              outputTokens: tokenCount(usageEntry, "outputTokens"),
              cacheReadTokens: tokenCount(usageEntry, "cacheReadInputTokens"),
              cacheWriteTokens: tokenCount(usageEntry, "cacheCreationInputTokens"),
            },
          ] satisfies [string, ModelTokenCounts],
        ]
      : [],
  );
}

/** Token usage of the whole run: every model, cache reads and cache writes included. */
export function totalTokenUsageFrom(modelUsage: unknown): TokenUsageRecord {
  const totalUsage: TokenUsageRecord = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
  for (const [, tokenCounts] of modelTokenCounts(modelUsage)) {
    totalUsage.inputTokens += tokenCounts.inputTokens;
    totalUsage.outputTokens += tokenCounts.outputTokens;
    totalUsage.cacheReadTokens += tokenCounts.cacheReadTokens;
    totalUsage.cacheWriteTokens += tokenCounts.cacheWriteTokens;
  }
  return totalUsage;
}

/**
 * The run's main model: the `model` option passed to `query()`; without it, the model with the most
 * input tokens (uncached + cache read + cache write; the first one wins a tie). `null` when neither
 * is known.
 */
export function mainModelIdentifier(
  requestedModelIdentifier: string | null,
  modelUsage: unknown,
): string | null {
  if (requestedModelIdentifier !== null) {
    return requestedModelIdentifier;
  }
  let mainModel: string | null = null;
  let mostInputTokens = -1;
  for (const [modelName, tokenCounts] of modelTokenCounts(modelUsage)) {
    const inputTokens =
      tokenCounts.inputTokens + tokenCounts.cacheReadTokens + tokenCounts.cacheWriteTokens;
    if (inputTokens > mostInputTokens) {
      mainModel = modelName;
      mostInputTokens = inputTokens;
    }
  }
  return mainModel;
}
