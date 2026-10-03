import { findMockTool, type MockToolDefinition, selectToolSubset } from "@krinolabs/bench";
import type { DecisionProvider, KrinoConfig, TraceSink } from "@krinolabs/krino";

// The log-triage agent: one task, one prompt, a slice of the bench catalog, krino in shadow mode.

export const PROJECT_NAME = "example-ai-sdk-cli";

/** The live model, through Vercel AI Gateway. Check this ID on live verification day. */
export const LIVE_MODEL_IDENTIFIER = "anthropic/claude-haiku-4.5";

export const TOOL_COUNTS = [10, 25, 50, 100] as const;
export type ToolCount = (typeof TOOL_COUNTS)[number];
export const DEFAULT_TOOL_COUNT: ToolCount = 100;

/** A multi-step task from the bench task set. */
export const LOG_TRIAGE_TASK_TEXT =
  "Request REQ-7f3a failed at checkout. Get its trace, then search payment-service logs for it " +
  "between 2026-10-01T10:00:00Z and 2026-10-01T10:15:00Z.";

/** The tools a correct run calls, in order. Every `--tools` size includes them. */
export const LOG_TRIAGE_TOOL_NAMES: ReadonlyArray<string> = [
  "get_request_trace",
  "search_application_logs",
];

export const SYSTEM_PROMPT =
  "You triage production incidents for an online shop. Use the tools to find out why a " +
  "request failed. Then answer in at most three sentences: the likely cause and the next step.";

export const MAX_STEP_COUNT = 6;

/** Shadow decisions run in the background; this only bounds how long one may take. */
export const DECISION_TIMEOUT_IN_MILLISECONDS = 5000;
export const FLUSH_TIMEOUT_IN_MILLISECONDS = 6000;

/** The log tools only read. The risk gate suggests "allow" at this confidence or above. */
const RISK_ALLOW_THRESHOLD = 0.8;

/** The task's tools first, then the rest of the logs domain, then the other domains. */
export function selectLogTriageTools(toolCount: ToolCount): Array<MockToolDefinition> {
  return selectToolSubset({ toolCount, requiredToolNames: LOG_TRIAGE_TOOL_NAMES }).flatMap(
    (toolName) => findMockTool(toolName) ?? [],
  );
}

export type LogTriageKrinoInputs = {
  toolNames: ReadonlyArray<string>;
  decisionProvider: DecisionProvider;
  traceSink: TraceSink;
};

export function createLogTriageKrinoConfig(krinoInputs: LogTriageKrinoInputs): KrinoConfig {
  return {
    projectName: PROJECT_NAME,
    decisionModes: { toolSelection: "shadow", riskGate: "shadow" },
    decisionTimeoutInMilliseconds: DECISION_TIMEOUT_IN_MILLISECONDS,
    riskGatePolicy: {
      blockedToolNames: [],
      alwaysAllowedToolNames: [],
      allowThresholdByToolName: Object.fromEntries(
        krinoInputs.toolNames.map((toolName) => [toolName, RISK_ALLOW_THRESHOLD]),
      ),
    },
    decisionProvider: krinoInputs.decisionProvider,
    traceSink: krinoInputs.traceSink,
  };
}
