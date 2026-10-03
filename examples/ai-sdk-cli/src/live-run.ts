import { createJevAiGatewayProvider } from "@krinolabs/krino/providers/jev";
import { gateway } from "ai";
import { LIVE_MODEL_IDENTIFIER, type ToolCount } from "./log-triage.js";
import { type LogTriageResult, runLogTriage } from "./run-log-triage.js";

// Live: the agent model and the Jev decision provider both go through Vercel AI Gateway.
// The key is read from the environment only, and never printed.

export const LIVE_KEY_VARIABLE_NAMES: ReadonlyArray<string> = ["AI_GATEWAY_API_KEY"];

/** The key variables that are unset or blank. Returns names only, never values. */
export function findMissingKeyVariables(
  environment: Readonly<Record<string, string | undefined>>,
): Array<string> {
  return LIVE_KEY_VARIABLE_NAMES.filter(
    (variableName) => (environment[variableName] ?? "").trim() === "",
  );
}

export type LiveRunOptions = { traceDirectory: string; toolCount: ToolCount };

export function runLiveLogTriage(liveRunOptions: LiveRunOptions): Promise<LogTriageResult> {
  return runLogTriage({
    model: gateway(LIVE_MODEL_IDENTIFIER),
    decisionProvider: createJevAiGatewayProvider(),
    traceDirectory: liveRunOptions.traceDirectory,
    toolCount: liveRunOptions.toolCount,
  });
}
