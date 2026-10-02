import { buildInputJsonSchema } from "./input-schema.js";
import { MOCK_TOOL_CATALOG } from "./mock-tool-catalog.js";
import type { MockToolDefinition } from "./mock-tool-definition.js";

/** Rough rule used across the plan: one token per four characters. */
export const CHARACTERS_PER_TOKEN = 4;

/** The tool definition as the model API receives it: name, description, JSON Schema input. */
export function serializeToolDefinition(toolDefinition: MockToolDefinition): string {
  return JSON.stringify({
    name: toolDefinition.toolName,
    description: toolDefinition.toolDescription,
    input_schema: buildInputJsonSchema(toolDefinition),
  });
}

export type CatalogSizeEstimate = {
  toolCount: number;
  characterCount: number;
  estimatedTokenCount: number;
};

export function estimateCatalogSize(
  toolDefinitions: ReadonlyArray<MockToolDefinition> = MOCK_TOOL_CATALOG,
): CatalogSizeEstimate {
  const characterCount = toolDefinitions.reduce(
    (runningCount, toolDefinition) => runningCount + serializeToolDefinition(toolDefinition).length,
    0,
  );
  return {
    toolCount: toolDefinitions.length,
    characterCount,
    estimatedTokenCount: Math.round(characterCount / CHARACTERS_PER_TOKEN),
  };
}
