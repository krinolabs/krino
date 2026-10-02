import type {
  DecisionAnswer,
  DecisionQuestion,
  DecisionStatus,
  PendingToolCall,
  RiskGatePolicy,
  RiskGateVerdict,
} from "../contracts/index.js";

// Stand-in for the WP-08 risk-gate policy module (`src/risk-gate/`), written against the
// signature on the WP-08 card. When WP-08 merges, import from `../risk-gate/` and delete this file.

export type RiskGateProviderFailure = "timedOut" | "failed";

export type RiskGateEvaluationInput = {
  pendingToolCall: PendingToolCall;
  riskGatePolicy: RiskGatePolicy | null;
  providerAnswer: DecisionAnswer | null;
  providerFailure: RiskGateProviderFailure | null;
};

export type RiskGateEvaluation = {
  verdict: RiskGateVerdict;
  decisionStatus: DecisionStatus;
};

const SAFE_CHOICE = "yes";

/** Order: block list → allow list → missing threshold → answer vs threshold; any failure → `askHuman`. */
export function evaluateRiskGate(evaluationInput: RiskGateEvaluationInput): RiskGateEvaluation {
  const { pendingToolCall, riskGatePolicy, providerAnswer, providerFailure } = evaluationInput;
  const toolName = pendingToolCall.toolName;

  if (riskGatePolicy?.blockedToolNames.includes(toolName)) {
    return { verdict: "block", decisionStatus: "answered" };
  }
  if (riskGatePolicy?.alwaysAllowedToolNames.includes(toolName)) {
    return { verdict: "allow", decisionStatus: "answered" };
  }
  const allowThreshold = riskGatePolicy?.allowThresholdByToolName[toolName];
  if (allowThreshold === undefined) {
    return { verdict: "askHuman", decisionStatus: "skippedUnsupported" };
  }
  if (providerFailure !== null) {
    return { verdict: "askHuman", decisionStatus: providerFailure };
  }
  if (providerAnswer === null || !Number.isFinite(providerAnswer.probability)) {
    return { verdict: "askHuman", decisionStatus: "failed" };
  }
  const answeredSafe = providerAnswer.choice.trim().toLowerCase() === SAFE_CHOICE;
  const verdict =
    answeredSafe && providerAnswer.probability >= allowThreshold ? "allow" : "askHuman";
  return { verdict, decisionStatus: "answered" };
}

/** True when only a provider answer can settle the verdict. */
export function riskGateNeedsProviderAnswer(
  pendingToolCall: PendingToolCall,
  riskGatePolicy: RiskGatePolicy | null,
): boolean {
  if (riskGatePolicy === null) {
    return false;
  }
  const toolName = pendingToolCall.toolName;
  return (
    !riskGatePolicy.blockedToolNames.includes(toolName) &&
    !riskGatePolicy.alwaysAllowedToolNames.includes(toolName) &&
    riskGatePolicy.allowThresholdByToolName[toolName] !== undefined
  );
}

function serializeToolArguments(toolArguments: Record<string, unknown>): string {
  try {
    return JSON.stringify(toolArguments) ?? "{}";
  } catch {
    return "[arguments could not be serialized]";
  }
}

/**
 * Tool name and structured arguments only. Never raw tool results: they can carry prompt injection.
 */
export function buildRiskQuestion(pendingToolCall: PendingToolCall): DecisionQuestion {
  return {
    decisionKind: "riskGate",
    questionText:
      `Is it safe to run the tool "${pendingToolCall.toolName}" with these arguments: ` +
      `${serializeToolArguments(pendingToolCall.toolArguments)}?`,
    options: null,
  };
}
