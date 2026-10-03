import { MOCK_TOOL_NAMES } from "@krinolabs/bench";
import { toClaudeAgentSdkToolName } from "@krinolabs/bench/claude-agent-sdk";
import { describe, expect, it } from "vitest";
import {
  buildRiskGatePolicy,
  classifyToolRisk,
  LOG_TRIAGE_TOOL_NAMES,
  WRITE_ALLOW_THRESHOLD,
} from "./log-triage.js";

describe("classifyToolRisk", () => {
  it.each([
    "search_application_logs",
    "get_request_trace",
    "list_carriers",
    "find_customer_by_email",
    "check_return_window",
    "validate_coupon",
    "estimate_delivery_date",
    "tail_service_logs",
  ])("treats %s as read-only", (toolName) => {
    expect(classifyToolRisk(toolName)).toBe("readOnly");
  });

  it.each([
    "create_support_ticket",
    "assign_ticket",
    "update_ticket_priority",
    "cancel_order",
    "approve_refund",
    "close_customer_account",
  ])("treats %s as a write", (toolName) => {
    expect(classifyToolRisk(toolName)).toBe("write");
  });

  it.each(["delete_customer", "purge_logs"])("treats %s as destructive", (toolName) => {
    expect(classifyToolRisk(toolName)).toBe("destructive");
  });
});

describe("buildRiskGatePolicy", () => {
  it("puts every catalog tool in exactly one place, under its Agent SDK name", () => {
    const riskGatePolicy = buildRiskGatePolicy(MOCK_TOOL_NAMES);
    const placedToolNames = [
      ...riskGatePolicy.alwaysAllowedToolNames,
      ...riskGatePolicy.blockedToolNames,
      ...Object.keys(riskGatePolicy.allowThresholdByToolName),
    ];
    expect([...placedToolNames].sort()).toEqual(
      MOCK_TOOL_NAMES.map(toClaudeAgentSdkToolName).sort(),
    );
  });

  it("always allows the read-only tools, the task's tools among them", () => {
    const riskGatePolicy = buildRiskGatePolicy(MOCK_TOOL_NAMES);
    expect(riskGatePolicy.alwaysAllowedToolNames).toEqual(
      expect.arrayContaining(
        [...LOG_TRIAGE_TOOL_NAMES, "list_carriers", "search_tickets"].map(toClaudeAgentSdkToolName),
      ),
    );
  });

  it("gives write tools the threshold from costs: $0.50 to ask, $5 for a bad call → 0.9", () => {
    const riskGatePolicy = buildRiskGatePolicy(MOCK_TOOL_NAMES);
    expect(WRITE_ALLOW_THRESHOLD).toBeCloseTo(0.9);
    const writeToolNames = ["create_support_ticket", "assign_ticket", "update_ticket_priority"];
    expect(riskGatePolicy.allowThresholdByToolName).toMatchObject(
      Object.fromEntries(
        writeToolNames.map((toolName) => [
          toClaudeAgentSdkToolName(toolName),
          WRITE_ALLOW_THRESHOLD,
        ]),
      ),
    );
  });

  it("blocks destructive tools; the bench catalog has none today", () => {
    expect(buildRiskGatePolicy(MOCK_TOOL_NAMES).blockedToolNames).toEqual([]);
    expect(buildRiskGatePolicy(["delete_customer", "get_order_status"]).blockedToolNames).toEqual([
      toClaudeAgentSdkToolName("delete_customer"),
    ]);
  });

  it.each(["constructor", "toString", "__proto__"])(
    "keeps a tool named %s as an own threshold entry",
    (toolName) => {
      const agentToolName = toClaudeAgentSdkToolName(toolName);
      const riskGatePolicy = buildRiskGatePolicy([toolName]);
      expect(Object.hasOwn(riskGatePolicy.allowThresholdByToolName, agentToolName)).toBe(true);
      expect(Object.keys(riskGatePolicy.allowThresholdByToolName)).toEqual([agentToolName]);
    },
  );
});
