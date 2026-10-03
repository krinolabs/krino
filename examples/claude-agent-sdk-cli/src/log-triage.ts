import { findMockTool, selectToolSubset, toToolDescriptions } from "@krinolabs/bench";
import { toClaudeAgentSdkToolName } from "@krinolabs/bench/claude-agent-sdk";
import type { DecisionProvider, KrinoConfig, ToolDescription, TraceSink } from "@krinolabs/krino";
import { buildRiskGatePolicy } from "./risk-policy.js";

// The log-triage agent: one prompt, a slice of the bench catalog, krino in shadow mode.
// The tasks are in log-triage-tasks.ts, the risk-gate policy in risk-policy.ts.

export const PROJECT_NAME = "example-claude-agent-sdk-cli";

/** The live model. Check this ID on live verification day. */
export const LIVE_MODEL_IDENTIFIER = "claude-haiku-4-5";

export const TOOL_COUNTS = [10, 25, 50, 100] as const;
export type ToolCount = (typeof TOOL_COUNTS)[number];
export const DEFAULT_TOOL_COUNT: ToolCount = 100;

export const SYSTEM_PROMPT =
  "You triage production incidents for an online shop. Use the tools to find out what went " +
  "wrong and do what the task asks. Then answer in at most three sentences: the likely cause " +
  "and what you did or what to do next.";

export const MAX_TURN_COUNT = 6;

/** Shadow decisions run in the background; this only bounds how long one may take. */
export const DECISION_TIMEOUT_IN_MILLISECONDS = 5000;
export const FLUSH_TIMEOUT_IN_MILLISECONDS = 6000;

/** Bench names: the task's tools first, then the rest of their domains, then the others. */
export function selectLogTriageToolNames(
  toolCount: ToolCount,
  requiredToolNames: ReadonlyArray<string>,
): Array<string> {
  return selectToolSubset({ toolCount, requiredToolNames });
}

/** What krino decides about, under the names the Agent SDK gives MCP tools. */
export function toAgentToolDescriptions(toolNames: ReadonlyArray<string>): Array<ToolDescription> {
  const toolDefinitions = toolNames.flatMap((toolName) => findMockTool(toolName) ?? []);
  return toToolDescriptions(toolDefinitions).map((toolDescription) => ({
    ...toolDescription,
    toolName: toClaudeAgentSdkToolName(toolDescription.toolName),
  }));
}

export type LogTriageKrinoInputs = {
  /** Bench names; the policy lists them under their Agent SDK names. */
  toolNames: ReadonlyArray<string>;
  decisionProvider: DecisionProvider;
  traceSink: TraceSink;
};

export function createLogTriageKrinoConfig(krinoInputs: LogTriageKrinoInputs): KrinoConfig {
  return {
    projectName: PROJECT_NAME,
    decisionModes: { toolSelection: "shadow", riskGate: "shadow" },
    decisionTimeoutInMilliseconds: DECISION_TIMEOUT_IN_MILLISECONDS,
    riskGatePolicy: buildRiskGatePolicy(krinoInputs.toolNames, toClaudeAgentSdkToolName),
    decisionProvider: krinoInputs.decisionProvider,
    traceSink: krinoInputs.traceSink,
  };
}
