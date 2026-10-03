// Entry point for `@krinolabs/example-ai-sdk-cli/agent`: the log-triage agent's parts, for the
// bench runner (`bench-runner/`). Private: no published package may depend on this example.

export { answerLikeAGoodProvider, FAKE_MODEL_IDENTIFIER } from "./fake-run.js";
export { findMissingKeyVariables, LIVE_KEY_VARIABLE_NAMES } from "./live-run.js";
export {
  FLUSH_TIMEOUT_IN_MILLISECONDS,
  LIVE_MODEL_IDENTIFIER,
  MAX_STEP_COUNT,
  SYSTEM_PROMPT,
  selectLogTriageTools,
  TOOL_COUNTS,
  type ToolCount,
} from "./log-triage.js";
export { buildRiskGatePolicy, classifyTool, type ToolClassification } from "./risk-policy.js";
