import { findMockTool, type MockToolDefinition, selectToolSubset } from "@krinolabs/bench";
import {
  type DecisionProvider,
  type KrinoConfig,
  type RiskGatePolicy,
  type TraceSink,
  thresholdFromCosts,
} from "@krinolabs/krino";

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

// Risk-gate policy, by what a tool does (its verb). Read-only tools are always allowed, write
// tools need a confident "safe" answer, destructive tools are blocked in code.

/** Verbs of tools that only read. `export_logs` returns log lines; it changes nothing. */
const READ_ONLY_VERBS: ReadonlyArray<string> = [
  "get",
  "list",
  "search",
  "find",
  "check",
  "validate",
  "estimate",
  "tail",
  "export",
];

/** Verbs of tools that destroy data. The bench catalog has none today; any added are blocked. */
const DESTRUCTIVE_VERBS: ReadonlyArray<string> = ["delete", "purge"];

/** Asking a person costs $0.50, a bad write (a wrong ticket) costs $5 → 1 - 0.50 / 5 = 0.9. */
export const WRITE_ALLOW_THRESHOLD = thresholdFromCosts({
  costOfAskingInUsd: 0.5,
  costOfBadCallInUsd: 5,
});

export type ToolRisk = "readOnly" | "write" | "destructive";

export function classifyToolRisk(toolName: string): ToolRisk {
  const toolVerb = toolName.split("_")[0] ?? "";
  if (DESTRUCTIVE_VERBS.includes(toolVerb)) {
    return "destructive";
  }
  return READ_ONLY_VERBS.includes(toolVerb) ? "readOnly" : "write";
}

export function buildRiskGatePolicy(toolNames: ReadonlyArray<string>): RiskGatePolicy {
  const toolNamesWithRisk = (toolRisk: ToolRisk): Array<string> =>
    toolNames.filter((toolName) => classifyToolRisk(toolName) === toolRisk);
  return {
    blockedToolNames: toolNamesWithRisk("destructive"),
    alwaysAllowedToolNames: toolNamesWithRisk("readOnly"),
    // Object.fromEntries defines own properties, so a name like `__proto__` stays a plain key.
    allowThresholdByToolName: Object.fromEntries(
      toolNamesWithRisk("write").map((toolName) => [toolName, WRITE_ALLOW_THRESHOLD]),
    ),
  };
}

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
    riskGatePolicy: buildRiskGatePolicy(krinoInputs.toolNames),
    decisionProvider: krinoInputs.decisionProvider,
    traceSink: krinoInputs.traceSink,
  };
}
