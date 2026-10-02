import { buildInputSchema } from "../catalog/input-schema.js";
import { findMockTool } from "../catalog/mock-tool-catalog.js";
import type { JsonObject, JsonValue } from "../catalog/mock-tool-definition.js";

export type MockToolExecutionSucceeded = {
  executionStatus: "succeeded";
  toolName: string;
  toolInput: JsonObject;
  /** FNV-1a hash of the tool name and canonical input: the same input always gives the same digest. */
  requestDigest: string;
  result: JsonObject;
};

export type MockToolExecutionFailed = {
  executionStatus: "failed";
  toolName: string;
  errorMessage: string;
};

export type MockToolExecutionOutcome = MockToolExecutionSucceeded | MockToolExecutionFailed;

/** JSON with object keys sorted, so that key order in the input does not change the digest. */
export function toCanonicalJson(value: JsonValue): string {
  if (Array.isArray(value)) {
    return `[${value.map(toCanonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const sortedEntries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${toCanonicalJson(value[key] ?? null)}`);
    return `{${sortedEntries.join(",")}}`;
  }
  return JSON.stringify(value);
}

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export function hashText(text: string): string {
  let hash = FNV_OFFSET_BASIS;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function cloneJsonObject(value: JsonObject): JsonObject {
  return structuredClone(value);
}

/**
 * Runs a mock tool. Pure and deterministic: no network, no clock, no randomness.
 * Never throws; an unknown tool or invalid input gives a `failed` outcome.
 */
export function executeMockTool(toolName: string, toolInput: unknown): MockToolExecutionOutcome {
  const toolDefinition = findMockTool(toolName);
  if (toolDefinition === undefined) {
    return { executionStatus: "failed", toolName, errorMessage: `Unknown tool: ${toolName}` };
  }
  const parsedInput = buildInputSchema(toolDefinition).safeParse(toolInput);
  if (!parsedInput.success) {
    const issueText = parsedInput.error.issues
      .map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
      .join("; ");
    return {
      executionStatus: "failed",
      toolName,
      errorMessage: `Invalid input for ${toolName}: ${issueText}`,
    };
  }
  // The schema only admits strings, numbers, booleans and enums, so the parsed input is JSON.
  const validatedInput = parsedInput.data as JsonObject;
  return {
    executionStatus: "succeeded",
    toolName,
    toolInput: cloneJsonObject(validatedInput),
    requestDigest: hashText(`${toolName}:${toCanonicalJson(validatedInput)}`),
    result: cloneJsonObject(toolDefinition.fixedResult),
  };
}
