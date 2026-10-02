import type { ModelPrice } from "../contracts/index.js";

const DATE_SUFFIX_PATTERN = /[-@]\d{8}$/;
const DOTTED_VERSION_PATTERN = /(\d)\.(\d)/g;
const BEDROCK_PREFIX = "anthropic.";

/**
 * One spelling per model, so host spellings match the table:
 * `anthropic/claude-sonnet-5.5`, `anthropic.claude-sonnet-5-5` and
 * `claude-sonnet-5-5-20260901` all become `claude-sonnet-5-5`.
 */
export function canonicalModelIdentifier(modelIdentifier: string): string {
  const lowerCased = modelIdentifier.trim().toLowerCase();
  const withoutGatewayPrefix = lowerCased.slice(lowerCased.lastIndexOf("/") + 1);
  const withoutBedrockPrefix = withoutGatewayPrefix.startsWith(BEDROCK_PREFIX)
    ? withoutGatewayPrefix.slice(BEDROCK_PREFIX.length)
    : withoutGatewayPrefix;
  return withoutBedrockPrefix
    .replace(DATE_SUFFIX_PATTERN, "")
    .replace(DOTTED_VERSION_PATTERN, "$1-$2");
}

/** An exact match wins; otherwise the first price whose canonical identifier matches. */
export function findModelPrice(
  modelIdentifier: string,
  modelPrices: ReadonlyArray<ModelPrice>,
): ModelPrice | null {
  const exactMatch = modelPrices.find(
    (modelPrice) => modelPrice.modelIdentifier === modelIdentifier,
  );
  if (exactMatch !== undefined) {
    return exactMatch;
  }
  const canonicalIdentifier = canonicalModelIdentifier(modelIdentifier);
  return (
    modelPrices.find(
      (modelPrice) => canonicalModelIdentifier(modelPrice.modelIdentifier) === canonicalIdentifier,
    ) ?? null
  );
}

/** Overrides replace table rows with the same identifier and come first in the result. */
export function mergeModelPrices(
  tablePrices: ReadonlyArray<ModelPrice>,
  priceOverrides: ReadonlyArray<ModelPrice>,
): Array<ModelPrice> {
  const overriddenIdentifiers = new Set(
    priceOverrides.map((modelPrice) => canonicalModelIdentifier(modelPrice.modelIdentifier)),
  );
  return [
    ...priceOverrides,
    ...tablePrices.filter(
      (modelPrice) =>
        !overriddenIdentifiers.has(canonicalModelIdentifier(modelPrice.modelIdentifier)),
    ),
  ];
}
