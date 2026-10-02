import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { thresholdFromCosts } from "./threshold-from-costs.js";

describe("thresholdFromCosts", () => {
  it.each([
    { costOfAskingInUsd: 1, costOfBadCallInUsd: 100, expected: 0.99 },
    { costOfAskingInUsd: 5, costOfBadCallInUsd: 20, expected: 0.75 },
    { costOfAskingInUsd: 10, costOfBadCallInUsd: 10, expected: 0 },
    // Asking costs more than a bad call: clamped to 0.
    { costOfAskingInUsd: 50, costOfBadCallInUsd: 10, expected: 0 },
    // A free bad call: never worth asking.
    { costOfAskingInUsd: 1, costOfBadCallInUsd: 0, expected: 0 },
    // Free asking: always ask unless certain.
    { costOfAskingInUsd: 0, costOfBadCallInUsd: 100, expected: 1 },
    { costOfAskingInUsd: 0, costOfBadCallInUsd: 0, expected: 1 },
    { costOfAskingInUsd: 1, costOfBadCallInUsd: Number.POSITIVE_INFINITY, expected: 1 },
  ])("asking $costOfAskingInUsd vs bad call $costOfBadCallInUsd → $expected", (row) => {
    expect(thresholdFromCosts(row)).toBeCloseTo(row.expected, 12);
  });

  it.each([
    { costOfAskingInUsd: -1, costOfBadCallInUsd: 10 },
    { costOfAskingInUsd: Number.NaN, costOfBadCallInUsd: 10 },
    { costOfAskingInUsd: Number.POSITIVE_INFINITY, costOfBadCallInUsd: 10 },
    { costOfAskingInUsd: 1, costOfBadCallInUsd: -10 },
    { costOfAskingInUsd: 1, costOfBadCallInUsd: Number.NaN },
  ])("rejects asking $costOfAskingInUsd vs bad call $costOfBadCallInUsd", (row) => {
    expect(() => thresholdFromCosts(row)).toThrow(RangeError);
  });

  it("property: always in 0..1 for valid costs", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1e12, noNaN: true }),
        fc.double({ min: 0, noNaN: true }),
        (costOfAskingInUsd, costOfBadCallInUsd) => {
          const allowThreshold = thresholdFromCosts({ costOfAskingInUsd, costOfBadCallInUsd });
          expect(allowThreshold).toBeGreaterThanOrEqual(0);
          expect(allowThreshold).toBeLessThanOrEqual(1);
        },
      ),
    );
  });
});
