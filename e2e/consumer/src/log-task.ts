import type { FakeAnswerFunction, RiskGatePolicy } from "@krinolabs/krino";

// The task both host runs play: find why the checkout service failed, using two read-only log
// tools. `restartService` is offered but never needed.

export const PROJECT_NAME = "e2e-consumer";

export const TASK_TEXT = "Why did the checkout service fail this morning?";

export const ANSWER_TEXT = "The checkout service ran out of memory at 09:14.";

export const LOG_TOOLS = [
  {
    toolName: "searchLogs",
    toolDescription: "Searches service logs by service name and time range.",
    result: "1 error: checkout OOMKilled at 09:14",
  },
  {
    toolName: "getLogEntry",
    toolDescription: "Returns one log entry by its ID.",
    result: "checkout: container exceeded its 512 MiB memory limit",
  },
  {
    toolName: "restartService",
    toolDescription: "Restarts a service.",
    result: "restarted",
  },
] as const;

export const SCRIPTED_TOOL_CALLS: ReadonlyArray<{
  toolName: "searchLogs" | "getLogEntry";
  toolInput: Record<string, unknown>;
}> = [
  { toolName: "searchLogs", toolInput: { service: "checkout", since: "08:00" } },
  { toolName: "getLogEntry", toolInput: { entryId: "log-42" } },
];

const NEEDED_TOOL_NAMES: ReadonlyArray<string> = ["searchLogs", "getLogEntry"];

/** Reads are always allowed; the restart has a threshold the fake provider never reaches. */
export const KRINO_RISK_GATE_POLICY: RiskGatePolicy = {
  blockedToolNames: [],
  alwaysAllowedToolNames: [...NEEDED_TOOL_NAMES],
  allowThresholdByToolName: { restartService: 0.95 },
};

/**
 * Answers tool selection like a good decision provider: yes for the two log reads, no for the
 * rest. `hostToolName` maps a task tool name to the name the host uses. Risk questions fall
 * through to the fake's "not sure" answer.
 */
export function answerLikeAGoodProvider(
  hostToolName: (toolName: string) => string,
): FakeAnswerFunction {
  return (decisionQuestion) => {
    if (decisionQuestion.decisionKind !== "toolSelection") {
      return null;
    }
    const isNeeded = NEEDED_TOOL_NAMES.some((toolName) =>
      decisionQuestion.questionText.startsWith(
        `Does the agent need the tool "${hostToolName(toolName)}"`,
      ),
    );
    return { choice: isNeeded ? "yes" : "no", probability: 0.95 };
  };
}
