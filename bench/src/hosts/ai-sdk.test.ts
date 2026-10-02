import { asSchema } from "ai";
import { describe, expect, it } from "vitest";
import { buildInputJsonSchema } from "../catalog/input-schema.js";
import { findMockTool, MOCK_TOOL_CATALOG } from "../catalog/mock-tool-catalog.js";
import { executeMockTool } from "../executor/execute-mock-tool.js";
import { createAiSdkToolSet } from "./ai-sdk.js";

const TOOL_EXECUTION_OPTIONS = { toolCallId: "call-1", messages: [], context: {} };

describe("createAiSdkToolSet", () => {
  it("defines one AI SDK tool per catalog tool, keyed by name", () => {
    const toolSet = createAiSdkToolSet();
    expect(Object.keys(toolSet)).toEqual(
      MOCK_TOOL_CATALOG.map((toolDefinition) => toolDefinition.toolName),
    );
    expect(toolSet.get_order_status?.description).toBe(
      findMockTool("get_order_status")?.toolDescription,
    );
  });

  it("sends the same JSON Schema that the token estimate counts", async () => {
    const toolSet = createAiSdkToolSet();
    for (const toolDefinition of MOCK_TOOL_CATALOG) {
      const aiSdkTool = toolSet[toolDefinition.toolName];
      const aiSdkJsonSchema = await asSchema(aiSdkTool?.inputSchema).jsonSchema;
      const { $schema: _ignoredSchemaUri, ...comparableJsonSchema } = aiSdkJsonSchema;
      expect(comparableJsonSchema, toolDefinition.toolName).toEqual(
        buildInputJsonSchema(toolDefinition),
      );
    }
  });

  it("executes with the fake executor", async () => {
    const toolSet = createAiSdkToolSet();
    const execute = toolSet.cancel_order?.execute;
    if (execute === undefined) {
      throw new Error("cancel_order has no execute function");
    }
    const toolInput = { orderId: "ORD-10422", cancellationReason: "customerRequest" };
    await expect(execute(toolInput, TOOL_EXECUTION_OPTIONS)).resolves.toEqual(
      executeMockTool("cancel_order", toolInput),
    );
  });

  it("builds a subset when given one", () => {
    const toolSet = createAiSdkToolSet(MOCK_TOOL_CATALOG.slice(0, 3));
    expect(Object.keys(toolSet)).toHaveLength(3);
  });
});
