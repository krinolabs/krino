import { MOCK_TOOL_NAMES } from "@krinolabs/bench";
import { toClaudeAgentSdkToolName } from "@krinolabs/bench/claude-agent-sdk";
import { describe, expect, it } from "vitest";
import {
  buildRiskGatePolicy,
  classifyTool,
  TOOL_CLASSIFICATION_OVERRIDES,
  type ToolClassification,
} from "./risk-policy.js";

const MONEY_TOOL_NAMES = [
  "create_refund",
  "issue_store_credit",
  "cancel_refund",
  "approve_refund",
  "escalate_refund",
  "authorize_payment",
  "capture_payment",
  "retry_failed_payment",
  "update_payment_method",
  "submit_dispute_evidence",
  "accept_dispute",
];

function thresholdOf(toolName: string): number | undefined {
  const riskGatePolicy = buildRiskGatePolicy([toolName]);
  return new Map(Object.entries(riskGatePolicy.allowThresholdByToolName)).get(toolName);
}

describe("classifyTool: the first-word rule", () => {
  it.each([
    "search_application_logs",
    "get_request_trace",
    "get_webhook_delivery_log",
    "list_carriers",
    "find_customer_by_email",
    "check_return_window",
    "validate_coupon",
    "estimate_delivery_date",
    "tail_service_logs",
    "get_refund_status",
    "list_order_payments",
  ])("treats %s as read-only", (toolName) => {
    expect(classifyTool(toolName)).toEqual({ toolRisk: "readOnly" });
  });

  it.each(["create_support_ticket", "assign_ticket", "update_ticket_priority", "cancel_order"])(
    "treats %s as a routine write: $5 for a bad call",
    (toolName) => {
      expect(classifyTool(toolName)).toEqual({ toolRisk: "write", costOfBadCallInUsd: 5 });
    },
  );

  it.each(["delete_customer", "purge_logs"])("treats %s as destructive", (toolName) => {
    expect(classifyTool(toolName)).toEqual({ toolRisk: "destructive" });
  });
});

describe("classifyTool: the override table, by effect", () => {
  it("prices export_logs as a write that can leak data: $50 → 0.99", () => {
    expect(classifyTool("export_logs")).toEqual({ toolRisk: "write", costOfBadCallInUsd: 50 });
    expect(thresholdOf("export_logs")).toBeCloseTo(0.99);
  });

  it.each(MONEY_TOOL_NAMES)("prices %s as a write that moves money: $50 → 0.99", (toolName) => {
    expect(classifyTool(toolName)).toEqual({ toolRisk: "write", costOfBadCallInUsd: 50 });
    expect(thresholdOf(toolName)).toBeCloseTo(0.99);
  });

  it("prices void_shipping_label at $20 → 0.975", () => {
    expect(classifyTool("void_shipping_label")).toEqual({
      toolRisk: "write",
      costOfBadCallInUsd: 20,
    });
    expect(thresholdOf("void_shipping_label")).toBeCloseTo(0.975);
  });

  it.each(["close_customer_account", "merge_customer_accounts"])(
    "blocks %s: it cannot be undone",
    (toolName) => {
      expect(classifyTool(toolName)).toEqual({ toolRisk: "destructive" });
      expect(buildRiskGatePolicy([toolName]).blockedToolNames).toEqual([toolName]);
    },
  );

  it("names only catalog tools", () => {
    for (const toolName of TOOL_CLASSIFICATION_OVERRIDES.keys()) {
      expect(MOCK_TOOL_NAMES).toContain(toolName);
    }
  });

  it("covers every refund and payment write", () => {
    const overriddenMoneyToolNames = [...TOOL_CLASSIFICATION_OVERRIDES.entries()]
      .filter(([, toolClassification]) => isMoneyWrite(toolClassification))
      .map(([toolName]) => toolName)
      .filter((toolName) => toolName !== "export_logs");
    expect([...overriddenMoneyToolNames].sort()).toEqual([...MONEY_TOOL_NAMES].sort());
  });
});

function isMoneyWrite(toolClassification: ToolClassification): boolean {
  return toolClassification.toolRisk === "write" && toolClassification.costOfBadCallInUsd === 50;
}

describe("buildRiskGatePolicy", () => {
  it("classifies every catalog tool exactly once", () => {
    const riskGatePolicy = buildRiskGatePolicy(MOCK_TOOL_NAMES);
    const placedToolNames = [
      ...riskGatePolicy.alwaysAllowedToolNames,
      ...riskGatePolicy.blockedToolNames,
      ...Object.keys(riskGatePolicy.allowThresholdByToolName),
    ];
    expect(placedToolNames).toHaveLength(MOCK_TOOL_NAMES.length);
    expect([...placedToolNames].sort()).toEqual([...MOCK_TOOL_NAMES].sort());
  });

  it("blocks only the two irreversible account tools in today's catalog", () => {
    expect([...buildRiskGatePolicy(MOCK_TOOL_NAMES).blockedToolNames].sort()).toEqual([
      "close_customer_account",
      "merge_customer_accounts",
    ]);
  });

  it("gives a routine write the threshold from costs: $0.50 to ask, $5 for a bad call → 0.9", () => {
    expect(thresholdOf("create_support_ticket")).toBeCloseTo(0.9);
  });

  it.each(["constructor", "toString", "__proto__"])(
    "keeps a tool named %s as an own threshold entry",
    (toolName) => {
      const riskGatePolicy = buildRiskGatePolicy([toolName]);
      expect(Object.hasOwn(riskGatePolicy.allowThresholdByToolName, toolName)).toBe(true);
      expect(thresholdOf(toolName)).toBeCloseTo(0.9);
    },
  );
});

describe("buildRiskGatePolicy on the Agent SDK", () => {
  it("lists every tool under the name krino's hook sees: mcp__krino-bench__<name>", () => {
    const riskGatePolicy = buildRiskGatePolicy(
      ["get_request_trace", "create_support_ticket", "close_customer_account"],
      toClaudeAgentSdkToolName,
    );
    expect(riskGatePolicy.alwaysAllowedToolNames).toEqual(["mcp__krino-bench__get_request_trace"]);
    expect(Object.keys(riskGatePolicy.allowThresholdByToolName)).toEqual([
      "mcp__krino-bench__create_support_ticket",
    ]);
    expect(riskGatePolicy.blockedToolNames).toEqual(["mcp__krino-bench__close_customer_account"]);
  });
});
