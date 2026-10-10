import type {
  DecisionKind,
  DecisionMode,
  DecisionProvider,
  KrinoConfig,
  ModelPrice,
  RiskGatePolicy,
  TraceSink,
} from "../contracts/index.js";
import { KRINO_CONFIG_DEFAULTS, KrinoConfigurationError } from "../contracts/index.js";

export type ResolvedKrinoConfig = {
  projectName: string;
  decisionModes: Record<DecisionKind, DecisionMode>;
  minimumConfidence: number;
  decisionTimeoutInMilliseconds: number;
  explorationRate: number;
  riskGatePolicy: RiskGatePolicy | null;
  decisionProvider: DecisionProvider | null;
  traceSink: TraceSink | null;
  redactContent: boolean;
  priceOverrides: Array<ModelPrice>;
  randomSource: () => number;
};

const DECISION_KINDS: ReadonlyArray<DecisionKind> = ["toolSelection", "riskGate", "modelRouting"];
const DECISION_MODES: ReadonlyArray<string> = ["off", "shadow", "enforce"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is Array<string> {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isRatio(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function configError(configFieldName: string, problem: string): KrinoConfigurationError {
  return new KrinoConfigurationError(`krino config: ${configFieldName} ${problem}`, {
    configFieldName,
  });
}

function resolveDecisionModes(decisionModes: unknown): Record<DecisionKind, DecisionMode> {
  if (!isRecord(decisionModes)) {
    throw configError("decisionModes", "must be an object");
  }
  const resolvedModes: Record<DecisionKind, DecisionMode> = {
    ...KRINO_CONFIG_DEFAULTS.decisionModes,
  };
  for (const [decisionKind, decisionMode] of Object.entries(decisionModes)) {
    const fieldName = `decisionModes.${decisionKind}`;
    if (!DECISION_KINDS.some((knownKind) => knownKind === decisionKind)) {
      throw configError(fieldName, "is not a known decision kind");
    }
    if (decisionMode === undefined) {
      continue;
    }
    if (typeof decisionMode !== "string" || !DECISION_MODES.includes(decisionMode)) {
      throw configError(fieldName, 'must be "off", "shadow" or "enforce"');
    }
    resolvedModes[decisionKind as DecisionKind] = decisionMode as DecisionMode;
  }
  if (resolvedModes.riskGate === "enforce") {
    throw configError("decisionModes.riskGate", 'cannot be "enforce" in v0.1; use "shadow"');
  }
  return resolvedModes;
}

function resolveRiskGatePolicy(riskGatePolicy: unknown): RiskGatePolicy | null {
  if (riskGatePolicy === undefined) {
    return null;
  }
  if (!isRecord(riskGatePolicy)) {
    throw configError("riskGatePolicy", "must be an object");
  }
  if (!isStringArray(riskGatePolicy.blockedToolNames)) {
    throw configError("riskGatePolicy.blockedToolNames", "must be an array of tool names");
  }
  if (!isStringArray(riskGatePolicy.alwaysAllowedToolNames)) {
    throw configError("riskGatePolicy.alwaysAllowedToolNames", "must be an array of tool names");
  }
  const thresholds = riskGatePolicy.allowThresholdByToolName;
  if (!isRecord(thresholds)) {
    throw configError("riskGatePolicy.allowThresholdByToolName", "must be an object");
  }
  for (const [toolName, threshold] of Object.entries(thresholds)) {
    if (!isRatio(threshold)) {
      throw configError(`riskGatePolicy.allowThresholdByToolName.${toolName}`, "must be in 0..1");
    }
  }
  return {
    blockedToolNames: [...riskGatePolicy.blockedToolNames],
    alwaysAllowedToolNames: [...riskGatePolicy.alwaysAllowedToolNames],
    allowThresholdByToolName: { ...(thresholds as Record<string, number>) },
  };
}

function resolveDecisionProvider(decisionProvider: unknown): DecisionProvider | null {
  if (decisionProvider === undefined) {
    return null;
  }
  if (
    !isRecord(decisionProvider) ||
    typeof decisionProvider.providerName !== "string" ||
    typeof decisionProvider.askDecisionQuestions !== "function"
  ) {
    throw configError("decisionProvider", "must have providerName and askDecisionQuestions");
  }
  return decisionProvider as DecisionProvider;
}

function resolveTraceSink(traceSink: unknown): TraceSink | null {
  if (traceSink === undefined) {
    return null;
  }
  if (
    !isRecord(traceSink) ||
    typeof traceSink.writeRecord !== "function" ||
    typeof traceSink.flush !== "function"
  ) {
    throw configError("traceSink", "must have writeRecord and flush");
  }
  return traceSink as TraceSink;
}

function resolvePriceOverrides(priceOverrides: unknown): Array<ModelPrice> {
  if (priceOverrides === undefined) {
    return [];
  }
  if (!Array.isArray(priceOverrides)) {
    throw configError("priceOverrides", "must be an array");
  }
  return priceOverrides.map((modelPrice: unknown, priceIndex) => {
    const fieldName = `priceOverrides.${priceIndex}`;
    if (!isRecord(modelPrice) || typeof modelPrice.modelIdentifier !== "string") {
      throw configError(fieldName, "must have a modelIdentifier");
    }
    const numericFields = [
      "inputPricePerMillionTokens",
      "outputPricePerMillionTokens",
      "cacheWriteMultiplier",
      "cacheReadMultiplier",
    ] as const;
    for (const numericField of numericFields) {
      if (!isNonNegativeNumber(modelPrice[numericField])) {
        throw configError(`${fieldName}.${numericField}`, "must be a number ≥ 0");
      }
    }
    if (typeof modelPrice.verifiedOn !== "string") {
      throw configError(`${fieldName}.verifiedOn`, "must be an ISO date string");
    }
    return { ...(modelPrice as ModelPrice) };
  });
}

/** Validates the config and applies defaults. Throws `KrinoConfigurationError`. */
export function resolveKrinoConfig(krinoConfig: KrinoConfig): ResolvedKrinoConfig {
  if (!isRecord(krinoConfig)) {
    throw new KrinoConfigurationError("krino config must be an object");
  }
  const projectName: unknown = krinoConfig.projectName;
  if (typeof projectName !== "string" || projectName.trim() === "") {
    throw configError("projectName", "must be a non-empty string");
  }

  const minimumConfidence =
    krinoConfig.minimumConfidence ?? KRINO_CONFIG_DEFAULTS.minimumConfidence;
  if (!isRatio(minimumConfidence)) {
    throw configError("minimumConfidence", "must be in 0..1");
  }
  const decisionTimeoutInMilliseconds =
    krinoConfig.decisionTimeoutInMilliseconds ??
    KRINO_CONFIG_DEFAULTS.decisionTimeoutInMilliseconds;
  if (!isNonNegativeNumber(decisionTimeoutInMilliseconds) || decisionTimeoutInMilliseconds === 0) {
    throw configError("decisionTimeoutInMilliseconds", "must be a number > 0");
  }
  const explorationRate = krinoConfig.explorationRate ?? KRINO_CONFIG_DEFAULTS.explorationRate;
  if (!isRatio(explorationRate)) {
    throw configError("explorationRate", "must be in 0..1");
  }
  const redactContent = krinoConfig.redactContent ?? KRINO_CONFIG_DEFAULTS.redactContent;
  if (typeof redactContent !== "boolean") {
    throw configError("redactContent", "must be a boolean");
  }
  const randomSource: unknown = krinoConfig.randomSource ?? Math.random;
  if (typeof randomSource !== "function") {
    throw configError("randomSource", "must be a function");
  }

  return {
    projectName,
    decisionModes: resolveDecisionModes(krinoConfig.decisionModes),
    minimumConfidence,
    decisionTimeoutInMilliseconds,
    explorationRate,
    riskGatePolicy: resolveRiskGatePolicy(krinoConfig.riskGatePolicy),
    decisionProvider: resolveDecisionProvider(krinoConfig.decisionProvider),
    traceSink: resolveTraceSink(krinoConfig.traceSink),
    redactContent,
    priceOverrides: resolvePriceOverrides(krinoConfig.priceOverrides),
    randomSource: randomSource as () => number,
  };
}
