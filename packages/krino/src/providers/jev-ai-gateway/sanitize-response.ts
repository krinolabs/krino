// Turns a live AI Gateway evaluation response into a fixture that is safe to commit.
// Keeps the shape and the numbers; drops every free-form string that could echo content.

const REDACTED = "[redacted]";
const NUMERIC_STRING_PATTERN = /^-?\d+(\.\d+)?(e-?\d+)?$/i;

type JsonValue = null | boolean | number | string | Array<JsonValue> | { [key: string]: JsonValue };

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Numbers and booleans stay; numeric strings (costs) stay; other strings are redacted. */
function sanitizeMetadataValue(value: unknown): JsonValue {
  if (value === null || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    return NUMERIC_STRING_PATTERN.test(value.trim()) ? value : REDACTED;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeMetadataValue);
  }
  if (isPlainRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, sanitizeMetadataValue(nestedValue)]),
    );
  }
  return null;
}

function sanitizeAnswer(answer: unknown): JsonValue {
  if (!isPlainRecord(answer)) {
    return null;
  }
  const sanitizedAnswer: Record<string, JsonValue> = {};
  if (typeof answer.type === "string") {
    sanitizedAnswer.type = answer.type;
  }
  // `choice` and the distribution keys are option names that krino wrote into the request.
  if (typeof answer.choice === "string") {
    sanitizedAnswer.choice = answer.choice;
  }
  for (const numericKey of ["probability", "score"] as const) {
    const numericValue = answer[numericKey];
    if (typeof numericValue === "number") {
      sanitizedAnswer[numericKey] = numericValue;
    }
  }
  if (isPlainRecord(answer.probabilities)) {
    sanitizedAnswer.probabilities = Object.fromEntries(
      Object.entries(answer.probabilities).filter(
        (entry): entry is [string, number] => typeof entry[1] === "number",
      ),
    );
  }
  return sanitizedAnswer;
}

/**
 * Keeps `answers`, `model`, `usage`, `rounding` and numeric provider metadata.
 * Drops everything else, including warnings and any field AI Gateway adds later.
 */
export function sanitizeJevResponseBody(responseBody: unknown): JsonValue {
  if (!isPlainRecord(responseBody)) {
    return null;
  }
  const sanitizedBody: Record<string, JsonValue> = {};
  if (isPlainRecord(responseBody.answers)) {
    sanitizedBody.answers = Object.fromEntries(
      Object.entries(responseBody.answers).map(([questionId, answer]) => [
        questionId,
        sanitizeAnswer(answer),
      ]),
    );
  }
  if (typeof responseBody.model === "string") {
    sanitizedBody.model = responseBody.model;
  }
  for (const numericGroupKey of ["usage", "rounding"] as const) {
    const numericGroup = responseBody[numericGroupKey];
    if (isPlainRecord(numericGroup)) {
      sanitizedBody[numericGroupKey] = Object.fromEntries(
        Object.entries(numericGroup).filter(
          (entry): entry is [string, number] => typeof entry[1] === "number",
        ),
      );
    }
  }
  // Warning text is free-form, so warnings are dropped rather than half-kept.
  sanitizedBody.warnings = [];
  if (isPlainRecord(responseBody.providerMetadata)) {
    sanitizedBody.providerMetadata = sanitizeMetadataValue(responseBody.providerMetadata);
  }
  return sanitizedBody;
}
