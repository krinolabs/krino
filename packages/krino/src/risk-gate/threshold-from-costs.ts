export type RiskCosts = {
  /** What one `askHuman` costs: a person's time, a stalled run. */
  costOfAskingInUsd: number;
  /** What one wrongly allowed call costs. */
  costOfBadCallInUsd: number;
};

/**
 * The allow threshold at which asking and risking a bad call cost the same:
 * `1 - costOfAsking / costOfBadCall`, clamped to 0..1.
 *
 * Free asking gives 1 (always ask unless certain), even when a bad call is free too.
 * Throws a `RangeError` on a negative or `NaN` cost, or an infinite cost of asking: it runs
 * while building a config, so a silent fallback would hide the mistake.
 *
 * @example
 * // Asking a person costs $0.50; a bad email costs $50 → allow only at probability ≥ 0.99.
 * const riskGatePolicy = {
 *   blockedToolNames: ["deleteDatabase"],
 *   alwaysAllowedToolNames: ["readFile"],
 *   allowThresholdByToolName: {
 *     sendEmail: thresholdFromCosts({ costOfAskingInUsd: 0.5, costOfBadCallInUsd: 50 }), // 0.99
 *   },
 * };
 */
export function thresholdFromCosts(riskCosts: RiskCosts): number {
  const { costOfAskingInUsd, costOfBadCallInUsd } = riskCosts;
  if (!Number.isFinite(costOfAskingInUsd) || costOfAskingInUsd < 0) {
    throw new RangeError("costOfAskingInUsd must be a finite number of at least 0");
  }
  if (Number.isNaN(costOfBadCallInUsd) || costOfBadCallInUsd < 0) {
    throw new RangeError("costOfBadCallInUsd must be a number of at least 0");
  }
  if (costOfAskingInUsd === 0) {
    return 1;
  }
  const breakEvenThreshold = 1 - costOfAskingInUsd / costOfBadCallInUsd;
  return Math.min(1, Math.max(0, breakEvenThreshold));
}
