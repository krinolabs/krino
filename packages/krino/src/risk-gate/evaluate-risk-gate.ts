import type {
  DecisionAnswer,
  DecisionStatus,
  PendingToolCall,
  RiskGatePolicy,
  RiskGateVerdict,
} from "../contracts/index.js";

/** Why the provider gave no usable answer. Context over budget counts as `failed`. */
export type RiskGateProviderFailure = "timedOut" | "failed";

export type RiskGateEvaluationInput = {
  pendingToolCall: PendingToolCall;
  /** `null` when the config has no risk-gate policy: every tool then lacks a threshold. */
  riskGatePolicy: RiskGatePolicy | null;
  providerAnswer: DecisionAnswer | null;
  providerFailure: RiskGateProviderFailure | null;
};

export type RiskGateEvaluation = {
  verdict: RiskGateVerdict;
  decisionStatus: DecisionStatus;
};

/** The risk question asks "is it safe?", so `yes` means safe. */
const SAFE_CHOICE = "yes";
const UNSAFE_CHOICE = "no";

/**
 * The tool's own threshold, or `null` when it has none. Uses `Object.hasOwn` so a tool named
 * `constructor` or `toString` never picks up an inherited value.
 */
export function findAllowThreshold(
  toolName: string,
  riskGatePolicy: RiskGatePolicy | null,
): number | null {
  if (
    riskGatePolicy === null ||
    !Object.hasOwn(riskGatePolicy.allowThresholdByToolName, toolName)
  ) {
    return null;
  }
  const allowThreshold = riskGatePolicy.allowThresholdByToolName[toolName];
  return typeof allowThreshold === "number" ? allowThreshold : null;
}

function isValidProbability(probability: number): boolean {
  return Number.isFinite(probability) && probability >= 0 && probability <= 1;
}

function normalizedSafetyChoice(choice: string): "safe" | "unsafe" | null {
  const normalizedChoice = choice.trim().toLowerCase();
  if (normalizedChoice === SAFE_CHOICE) {
    return "safe";
  }
  if (normalizedChoice === UNSAFE_CHOICE) {
    return "unsafe";
  }
  return null;
}

/**
 * Suggests a verdict for one pending tool call. Fails closed: anything short of a confident
 * "safe" answer at or above the tool's threshold is `askHuman`. Only code blocks; the model never
 * does.
 *
 * Order: block list → allow list → missing threshold → provider answer vs threshold.
 * Any provider failure, or a malformed answer, → `askHuman`.
 */
export function evaluateRiskGate(evaluationInput: RiskGateEvaluationInput): RiskGateEvaluation {
  const { pendingToolCall, riskGatePolicy, providerAnswer, providerFailure } = evaluationInput;
  const toolName = pendingToolCall.toolName;

  if (riskGatePolicy?.blockedToolNames.includes(toolName)) {
    return { verdict: "block", decisionStatus: "answered" };
  }
  if (riskGatePolicy?.alwaysAllowedToolNames.includes(toolName)) {
    return { verdict: "allow", decisionStatus: "answered" };
  }
  const allowThreshold = findAllowThreshold(toolName, riskGatePolicy);
  if (allowThreshold === null) {
    return { verdict: "askHuman", decisionStatus: "skippedUnsupported" };
  }
  if (providerFailure !== null) {
    return { verdict: "askHuman", decisionStatus: providerFailure };
  }
  if (providerAnswer === null || !isValidProbability(providerAnswer.probability)) {
    return { verdict: "askHuman", decisionStatus: "failed" };
  }
  const safetyChoice = normalizedSafetyChoice(providerAnswer.choice);
  if (safetyChoice === null) {
    return { verdict: "askHuman", decisionStatus: "failed" };
  }
  // A non-finite threshold fails the comparison, so it can only ask a human.
  const isConfidentlySafe = safetyChoice === "safe" && providerAnswer.probability >= allowThreshold;
  return { verdict: isConfidentlySafe ? "allow" : "askHuman", decisionStatus: "answered" };
}

/** True when only a provider answer can settle the verdict, so the runtime should ask one. */
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
    findAllowThreshold(toolName, riskGatePolicy) !== null
  );
}
