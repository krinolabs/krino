import { describe, expect, it } from "vitest";
import { MOCK_TOOL_CATALOG } from "../catalog/mock-tool-catalog.js";
import type {
  JsonObject,
  MockToolDefinition,
  MockToolParameter,
} from "../catalog/mock-tool-definition.js";
import { executeMockTool, hashText, toCanonicalJson } from "./execute-mock-tool.js";

function sampleValue(parameter: MockToolParameter): string | number | boolean {
  switch (parameter.parameterType) {
    case "string":
      return parameter.allowedValues?.[0] ?? `sample-${parameter.parameterName}`;
    case "integer":
      return 3;
    case "number":
      return 2.5;
    case "boolean":
      return true;
  }
}

function buildSampleInput(toolDefinition: MockToolDefinition): JsonObject {
  return Object.fromEntries(
    toolDefinition.parameters.map((parameter) => [parameter.parameterName, sampleValue(parameter)]),
  );
}

describe("executeMockTool", () => {
  it.each(MOCK_TOOL_CATALOG.map((toolDefinition) => [toolDefinition.toolName, toolDefinition]))(
    "runs %s with valid input",
    (_toolName, toolDefinition) => {
      const executionOutcome = executeMockTool(
        toolDefinition.toolName,
        buildSampleInput(toolDefinition),
      );
      expect(executionOutcome).toMatchObject({
        executionStatus: "succeeded",
        toolName: toolDefinition.toolName,
        result: toolDefinition.fixedResult,
      });
    },
  );

  it("returns the same output for the same input", () => {
    const toolInput = { orderId: "ORD-10422" };
    const firstOutcome = executeMockTool("get_order_status", toolInput);
    const secondOutcome = executeMockTool("get_order_status", { orderId: "ORD-10422" });
    expect(secondOutcome).toEqual(firstOutcome);
  });

  it("ignores key order when computing the digest", () => {
    const firstOutcome = executeMockTool("transfer_stock", {
      sku: "TEE-BLK-M",
      fromWarehouseId: "WH-EAST",
      toWarehouseId: "WH-WEST",
      quantity: 40,
    });
    const reorderedOutcome = executeMockTool("transfer_stock", {
      quantity: 40,
      toWarehouseId: "WH-WEST",
      fromWarehouseId: "WH-EAST",
      sku: "TEE-BLK-M",
    });
    expect(reorderedOutcome).toEqual(firstOutcome);
  });

  it("gives a different digest for different input", () => {
    const firstOutcome = executeMockTool("get_order_status", { orderId: "ORD-1" });
    const secondOutcome = executeMockTool("get_order_status", { orderId: "ORD-2" });
    expect(firstOutcome.executionStatus).toBe("succeeded");
    expect(secondOutcome.executionStatus).toBe("succeeded");
    if (
      firstOutcome.executionStatus === "succeeded" &&
      secondOutcome.executionStatus === "succeeded"
    ) {
      expect(firstOutcome.requestDigest).not.toBe(secondOutcome.requestDigest);
      expect(firstOutcome.requestDigest).toMatch(/^[0-9a-f]{8}$/);
    }
  });

  it("drops input keys the tool does not declare", () => {
    const executionOutcome = executeMockTool("get_order_status", {
      orderId: "ORD-10422",
      unexpectedKey: "ignored",
    });
    expect(executionOutcome).toMatchObject({ toolInput: { orderId: "ORD-10422" } });
  });

  it("returns a copy of the fixed result that callers cannot change", () => {
    const firstOutcome = executeMockTool("get_order_status", { orderId: "ORD-10422" });
    if (firstOutcome.executionStatus === "succeeded") {
      firstOutcome.result.fulfillmentStatus = "changed";
    }
    expect(executeMockTool("get_order_status", { orderId: "ORD-10422" })).toMatchObject({
      result: { fulfillmentStatus: "shipped" },
    });
  });

  it.each(["unknown_tool", "constructor", "toString", "__proto__", "hasOwnProperty"])(
    "fails without throwing for unknown tool %s",
    (toolName) => {
      expect(executeMockTool(toolName, {})).toEqual({
        executionStatus: "failed",
        toolName,
        errorMessage: `Unknown tool: ${toolName}`,
      });
    },
  );

  it("fails without throwing when a required parameter is missing", () => {
    const executionOutcome = executeMockTool("get_order_status", {});
    expect(executionOutcome.executionStatus).toBe("failed");
    expect(executionOutcome).toMatchObject({
      errorMessage: expect.stringContaining("orderId"),
    });
  });

  it("fails when a value is outside the allowed values", () => {
    const executionOutcome = executeMockTool("cancel_order", {
      orderId: "ORD-10422",
      cancellationReason: "boredom",
    });
    expect(executionOutcome.executionStatus).toBe("failed");
  });

  it("fails when an integer parameter gets a fraction", () => {
    const executionOutcome = executeMockTool("transfer_stock", {
      sku: "TEE-BLK-M",
      fromWarehouseId: "WH-EAST",
      toWarehouseId: "WH-WEST",
      quantity: 1.5,
    });
    expect(executionOutcome.executionStatus).toBe("failed");
  });

  it.each([null, "text", 42, ["orderId"]])("fails when the input is %j", (toolInput) => {
    expect(executeMockTool("get_order_status", toolInput).executionStatus).toBe("failed");
  });
});

describe("toCanonicalJson", () => {
  it("sorts object keys at every depth", () => {
    expect(toCanonicalJson({ beta: 1, alpha: { delta: [true, null], gamma: "x" } })).toBe(
      '{"alpha":{"delta":[true,null],"gamma":"x"},"beta":1}',
    );
  });
});

describe("hashText", () => {
  it("returns the FNV-1a 32-bit hash as eight hex characters", () => {
    expect(hashText("")).toBe("811c9dc5");
    expect(hashText("a")).toBe("e40c292c");
  });
});
