import type { HookCallback, HookJSONOutput } from "@anthropic-ai/claude-agent-sdk";
import type { RiskGateVerdict, RunHandle } from "../../contracts/index.js";
import type { AgentRunState } from "./agent-run-state.js";

/** An empty hook output: the host's own permission flow decides. */
const NO_HOOK_DECISION: HookJSONOutput = {};

/**
 * What krino's hook returns for the verdict the runtime applies. `null` (shadow mode) and `allow`
 * change nothing: krino never says `allow`, which would skip the host's own permission checks.
 */
export function hookOutputForVerdict(verdictToApply: RiskGateVerdict | null): HookJSONOutput {
  if (verdictToApply === "block" || verdictToApply === "askHuman") {
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: verdictToApply === "block" ? "deny" : "ask",
        permissionDecisionReason: `krino risk gate: ${verdictToApply}`,
      },
    };
  }
  return NO_HOOK_DECISION;
}

function toolArgumentsFrom(toolInput: unknown): Record<string, unknown> {
  if (typeof toolInput !== "object" || toolInput === null || Array.isArray(toolInput)) {
    return {};
  }
  return { ...toolInput };
}

/**
 * krino's `PreToolUse` callback. Each call is one step: `stepNumber` is the 1-based index of the
 * tool call within the run (subagent calls included), because the Agent SDK does not expose turns.
 * Shadow mode records only. Never throws into the host.
 */
export function createKrinoPreToolUseHook(
  runHandle: RunHandle,
  runState: AgentRunState,
): HookCallback {
  return async (hookInput) => {
    if (hookInput.hook_event_name !== "PreToolUse" || typeof hookInput.tool_name !== "string") {
      return NO_HOOK_DECISION;
    }
    runState.toolCallCount += 1;
    const stepNumber = runState.toolCallCount;
    const toolName = hookInput.tool_name;
    runState.usedToolNames.add(toolName);
    try {
      const riskGateOutcome = await runHandle.checkToolCallRisk({
        runIdentifier: runHandle.runIdentifier,
        stepNumber,
        toolName,
        toolArguments: toolArgumentsFrom(hookInput.tool_input),
      });
      runState.toolCallSteps.push({
        stepNumber,
        toolName,
        riskDecisionRecord: riskGateOutcome.decisionRecord,
      });
      return hookOutputForVerdict(riskGateOutcome.verdictToApply);
    } catch (unexpectedError) {
      console.warn(`krino: risk check failed unexpectedly: ${String(unexpectedError)}`);
      return NO_HOOK_DECISION;
    }
  };
}
