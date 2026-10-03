import { query } from "@anthropic-ai/claude-agent-sdk";
import { createJevAiGatewayProvider } from "@krinolabs/krino/providers/jev";
import type { ToolCount } from "./log-triage.js";
import type { ResolvedExampleTask } from "./log-triage-tasks.js";
import { type LogTriageResult, runLogTriage } from "./run-log-triage.js";

// Live: the Claude Agent SDK runs the agent (ANTHROPIC_API_KEY); the Jev decision provider goes
// through Vercel AI Gateway (AI_GATEWAY_API_KEY). Keys are read from the environment only, and
// never printed.

export const LIVE_KEY_VARIABLE_NAMES: ReadonlyArray<string> = [
  "ANTHROPIC_API_KEY",
  "AI_GATEWAY_API_KEY",
];

/** The key variables that are unset or blank. Returns names only, never values. */
export function findMissingKeyVariables(
  environment: Readonly<Record<string, string | undefined>>,
): Array<string> {
  return LIVE_KEY_VARIABLE_NAMES.filter(
    (variableName) => (environment[variableName] ?? "").trim() === "",
  );
}

export type LiveRunOptions = {
  traceDirectory: string;
  toolCount: ToolCount;
  task: ResolvedExampleTask;
};

export function runLiveLogTriage(liveRunOptions: LiveRunOptions): Promise<LogTriageResult> {
  return runLogTriage({
    startAgent: (queryOptions) =>
      query({ prompt: liveRunOptions.task.taskText, options: queryOptions }),
    decisionProvider: createJevAiGatewayProvider(),
    traceDirectory: liveRunOptions.traceDirectory,
    toolCount: liveRunOptions.toolCount,
    task: liveRunOptions.task,
  });
}
