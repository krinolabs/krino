import { type ToolSet, tool } from "ai";
import { buildInputSchema } from "../catalog/input-schema.js";
import { MOCK_TOOL_CATALOG } from "../catalog/mock-tool-catalog.js";
import type { MockToolDefinition } from "../catalog/mock-tool-definition.js";
import { executeMockTool } from "../executor/execute-mock-tool.js";

/**
 * The catalog as AI SDK `tool()` definitions, keyed by tool name.
 * Each `execute` runs the deterministic fake executor and returns its outcome.
 */
export function createAiSdkToolSet(
  toolDefinitions: ReadonlyArray<MockToolDefinition> = MOCK_TOOL_CATALOG,
): ToolSet {
  // Object.fromEntries defines own properties, so no tool name can reach the prototype.
  return Object.fromEntries(
    toolDefinitions.map((toolDefinition) => [
      toolDefinition.toolName,
      tool({
        description: toolDefinition.toolDescription,
        inputSchema: buildInputSchema(toolDefinition),
        execute: async (toolInput) => executeMockTool(toolDefinition.toolName, toolInput),
      }),
    ]),
  );
}
