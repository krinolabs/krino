import type { ToolDescription } from "@krinolabs/krino";
import { COUPON_TOOLS } from "./domains/coupons.js";
import { CUSTOMER_TOOLS } from "./domains/customers.js";
import { INVENTORY_TOOLS } from "./domains/inventory.js";
import { LOG_TOOLS } from "./domains/logs.js";
import { ORDER_TOOLS } from "./domains/orders.js";
import { PAYMENT_TOOLS } from "./domains/payments.js";
import { REFUND_TOOLS } from "./domains/refunds.js";
import { RETURN_TOOLS } from "./domains/returns.js";
import { SHIPPING_TOOLS } from "./domains/shipping.js";
import { SUPPORT_TICKET_TOOLS } from "./domains/support-tickets.js";
import type { MockToolDefinition } from "./mock-tool-definition.js";

/** All 100 mock tools, grouped by domain in a fixed order. */
export const MOCK_TOOL_CATALOG: ReadonlyArray<MockToolDefinition> = [
  ...ORDER_TOOLS,
  ...REFUND_TOOLS,
  ...SHIPPING_TOOLS,
  ...COUPON_TOOLS,
  ...CUSTOMER_TOOLS,
  ...INVENTORY_TOOLS,
  ...PAYMENT_TOOLS,
  ...RETURN_TOOLS,
  ...SUPPORT_TICKET_TOOLS,
  ...LOG_TOOLS,
];

// A Map, not a plain object: tool names come from the model and may be 'constructor' or '__proto__'.
const MOCK_TOOLS_BY_NAME: ReadonlyMap<string, MockToolDefinition> = new Map(
  MOCK_TOOL_CATALOG.map((toolDefinition) => [toolDefinition.toolName, toolDefinition]),
);

export function findMockTool(toolName: string): MockToolDefinition | undefined {
  return MOCK_TOOLS_BY_NAME.get(toolName);
}

export function hasMockTool(toolName: string): boolean {
  return MOCK_TOOLS_BY_NAME.has(toolName);
}

/** The catalog as krino `ToolDescription`s, for `StepContext.availableTools`. */
export function toToolDescriptions(
  toolDefinitions: ReadonlyArray<MockToolDefinition> = MOCK_TOOL_CATALOG,
): Array<ToolDescription> {
  return toolDefinitions.map((toolDefinition) => ({
    toolName: toolDefinition.toolName,
    toolDescription: toolDefinition.toolDescription,
  }));
}
