import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { DecisionAnswer, PendingToolCall, RiskGatePolicy } from "../contracts/index.js";
import {
  evaluateRiskGate,
  findAllowThreshold,
  type RiskGateEvaluation,
  type RiskGateProviderFailure,
  riskGateNeedsProviderAnswer,
} from "./evaluate-risk-gate.js";

const riskGatePolicy: RiskGatePolicy = {
  blockedToolNames: ["deleteDatabase"],
  alwaysAllowedToolNames: ["readFile"],
  allowThresholdByToolName: { sendEmail: 0.9, deleteDatabase: 0, readFile: 1 },
};

function toolCall(toolName: string, toolArguments: Record<string, unknown> = {}): PendingToolCall {
  return { runIdentifier: "run-1", stepNumber: 2, toolName, toolArguments };
}

function answer(choice: string, probability: number): DecisionAnswer {
  return { choice, probability, decisionModelVersion: "test", latencyInMilliseconds: 1 };
}

type RiskGateRow = {
  situation: string;
  toolName: string;
  providerAnswer: DecisionAnswer | null;
  providerFailure: RiskGateProviderFailure | null;
  expected: RiskGateEvaluation;
};

/**
 * The risk-gate column of `docs/plan/shared/04-behavior-rules.md`. Two rows belong to the runtime
 * (WP-02), because the evaluator is never called for them; `core/runtime.test.ts` covers them:
 * - "Host cannot apply decision" → skippedUnsupported, provider not called.
 * - "Process exits before answer" → cutOff, nothing applied.
 * "Exploration sample" is `—` for the risk gate: the evaluator takes no random input (see the
 * determinism property below).
 */
const behaviorRuleRows: Array<RiskGateRow> = [
  {
    // The evaluator has no mode input: in shadow the runtime records this suggestion and applies
    // nothing.
    situation: "Shadow mode: the suggestion to record",
    toolName: "sendEmail",
    providerAnswer: answer("yes", 0.95),
    providerFailure: null,
    expected: { verdict: "allow", decisionStatus: "answered" },
  },
  {
    situation: "Provider times out",
    toolName: "sendEmail",
    providerAnswer: null,
    providerFailure: "timedOut",
    expected: { verdict: "askHuman", decisionStatus: "timedOut" },
  },
  {
    situation: "Provider error",
    toolName: "sendEmail",
    providerAnswer: null,
    providerFailure: "failed",
    expected: { verdict: "askHuman", decisionStatus: "failed" },
  },
  {
    situation: "Probability < minimum (the tool's threshold)",
    toolName: "sendEmail",
    providerAnswer: answer("yes", 0.89),
    providerFailure: null,
    expected: { verdict: "askHuman", decisionStatus: "answered" },
  },
  {
    // The runtime reports a context it cannot fit as a provider failure.
    situation: "Context over budget",
    toolName: "sendEmail",
    providerAnswer: null,
    providerFailure: "failed",
    expected: { verdict: "askHuman", decisionStatus: "failed" },
  },
  {
    situation: "Tool has no threshold",
    toolName: "unknownTool",
    providerAnswer: answer("yes", 1),
    providerFailure: null,
    expected: { verdict: "askHuman", decisionStatus: "skippedUnsupported" },
  },
];

const policyRows: Array<RiskGateRow> = [
  {
    situation: "block list wins over a safe answer with probability 1",
    toolName: "deleteDatabase",
    providerAnswer: answer("yes", 1),
    providerFailure: null,
    expected: { verdict: "block", decisionStatus: "answered" },
  },
  {
    situation: "block list wins over a provider failure",
    toolName: "deleteDatabase",
    providerAnswer: null,
    providerFailure: "timedOut",
    expected: { verdict: "block", decisionStatus: "answered" },
  },
  {
    situation: "allow list needs no answer",
    toolName: "readFile",
    providerAnswer: null,
    providerFailure: null,
    expected: { verdict: "allow", decisionStatus: "answered" },
  },
  {
    situation: "probability exactly at the threshold allows",
    toolName: "sendEmail",
    providerAnswer: answer("yes", 0.9),
    providerFailure: null,
    expected: { verdict: "allow", decisionStatus: "answered" },
  },
  {
    situation: "the safe choice is read without case or surrounding space",
    toolName: "sendEmail",
    providerAnswer: answer("  YES ", 0.95),
    providerFailure: null,
    expected: { verdict: "allow", decisionStatus: "answered" },
  },
  {
    situation: "a confident unsafe answer asks a human; only code blocks",
    toolName: "sendEmail",
    providerAnswer: answer("no", 0.99),
    providerFailure: null,
    expected: { verdict: "askHuman", decisionStatus: "answered" },
  },
  {
    situation: "a failure wins over an answer passed with it",
    toolName: "sendEmail",
    providerAnswer: answer("yes", 1),
    providerFailure: "failed",
    expected: { verdict: "askHuman", decisionStatus: "failed" },
  },
  {
    situation: "no answer and no failure",
    toolName: "sendEmail",
    providerAnswer: null,
    providerFailure: null,
    expected: { verdict: "askHuman", decisionStatus: "failed" },
  },
  {
    situation: "a choice that is neither yes nor no",
    toolName: "sendEmail",
    providerAnswer: answer("probably", 1),
    providerFailure: null,
    expected: { verdict: "askHuman", decisionStatus: "failed" },
  },
  {
    situation: "a NaN probability",
    toolName: "sendEmail",
    providerAnswer: answer("yes", Number.NaN),
    providerFailure: null,
    expected: { verdict: "askHuman", decisionStatus: "failed" },
  },
  {
    situation: "a probability above 1",
    toolName: "sendEmail",
    providerAnswer: answer("yes", 1.5),
    providerFailure: null,
    expected: { verdict: "askHuman", decisionStatus: "failed" },
  },
  {
    situation: "a negative probability",
    toolName: "sendEmail",
    providerAnswer: answer("yes", -0.1),
    providerFailure: null,
    expected: { verdict: "askHuman", decisionStatus: "failed" },
  },
  {
    situation: "a tool named like an inherited object property has no threshold",
    toolName: "constructor",
    providerAnswer: answer("yes", 1),
    providerFailure: null,
    expected: { verdict: "askHuman", decisionStatus: "skippedUnsupported" },
  },
];

function evaluateRow(row: RiskGateRow): RiskGateEvaluation {
  return evaluateRiskGate({
    pendingToolCall: toolCall(row.toolName),
    riskGatePolicy,
    providerAnswer: row.providerAnswer,
    providerFailure: row.providerFailure,
  });
}

describe("evaluateRiskGate: risk-gate column of the behavior rules", () => {
  it.each(behaviorRuleRows)("$situation", (row) => {
    expect(evaluateRow(row)).toEqual(row.expected);
  });
});

describe("evaluateRiskGate: policy order and answer checks", () => {
  it.each(policyRows)("$situation", (row) => {
    expect(evaluateRow(row)).toEqual(row.expected);
  });

  it("asks a human when there is no policy at all", () => {
    expect(
      evaluateRiskGate({
        pendingToolCall: toolCall("sendEmail"),
        riskGatePolicy: null,
        providerAnswer: answer("yes", 1),
        providerFailure: null,
      }),
    ).toEqual({ verdict: "askHuman", decisionStatus: "skippedUnsupported" });
  });

  it("a NaN threshold can only ask a human", () => {
    expect(
      evaluateRiskGate({
        pendingToolCall: toolCall("sendEmail"),
        riskGatePolicy: { ...riskGatePolicy, allowThresholdByToolName: { sendEmail: Number.NaN } },
        providerAnswer: answer("yes", 1),
        providerFailure: null,
      }),
    ).toEqual({ verdict: "askHuman", decisionStatus: "answered" });
  });
});

const toolNameArbitrary = fc.oneof(
  fc.string(),
  fc.constantFrom("sendEmail", "constructor", "toString", "__proto__", "hasOwnProperty"),
);

const providerAnswerArbitrary = fc.option(
  fc.record({
    choice: fc.oneof(fc.constantFrom("yes", "no", " Yes "), fc.string()),
    probability: fc.oneof(fc.double(), fc.constantFrom(0, 1)),
    decisionModelVersion: fc.string(),
    latencyInMilliseconds: fc.nat(),
  }),
  { nil: null },
);

const providerFailureArbitrary = fc.constantFrom<RiskGateProviderFailure>("timedOut", "failed");

const riskGatePolicyArbitrary = fc.record({
  blockedToolNames: fc.array(toolNameArbitrary),
  alwaysAllowedToolNames: fc.array(toolNameArbitrary),
  allowThresholdByToolName: fc.dictionary(fc.string(), fc.double({ min: 0, max: 1, noNaN: true })),
});

describe("evaluateRiskGate: properties", () => {
  it("any provider failure never yields allow (fail closed)", () => {
    fc.assert(
      fc.property(
        toolNameArbitrary,
        riskGatePolicyArbitrary,
        fc.double({ min: 0, max: 1, noNaN: true }),
        providerFailureArbitrary,
        providerAnswerArbitrary,
        (toolName, generatedPolicy, allowThreshold, providerFailure, providerAnswer) => {
          const evaluation = evaluateRiskGate({
            pendingToolCall: toolCall(toolName),
            riskGatePolicy: {
              ...generatedPolicy,
              // Only an explicit allow-list entry in code may allow without an answer.
              alwaysAllowedToolNames: generatedPolicy.alwaysAllowedToolNames.filter(
                (allowedName) => allowedName !== toolName,
              ),
              // Give the tool a threshold so the provider path is reached.
              allowThresholdByToolName: {
                ...generatedPolicy.allowThresholdByToolName,
                [toolName]: allowThreshold,
              },
            },
            providerAnswer,
            providerFailure,
          });
          expect(evaluation.verdict).not.toBe("allow");
        },
      ),
    );
  });

  it("a block-listed tool is always blocked, whatever the provider says", () => {
    fc.assert(
      fc.property(
        toolNameArbitrary,
        riskGatePolicyArbitrary,
        providerAnswerArbitrary,
        fc.option(providerFailureArbitrary, { nil: null }),
        (toolName, generatedPolicy, providerAnswer, providerFailure) => {
          const evaluation = evaluateRiskGate({
            pendingToolCall: toolCall(toolName),
            riskGatePolicy: {
              ...generatedPolicy,
              blockedToolNames: [...generatedPolicy.blockedToolNames, toolName],
              // Even when the tool is also on the allow list.
              alwaysAllowedToolNames: [...generatedPolicy.alwaysAllowedToolNames, toolName],
            },
            providerAnswer,
            providerFailure,
          });
          expect(evaluation.verdict).toBe("block");
        },
      ),
    );
  });

  it("allow needs the allow list or a safe answer at or above the threshold", () => {
    fc.assert(
      fc.property(
        toolNameArbitrary,
        riskGatePolicyArbitrary,
        providerAnswerArbitrary,
        fc.option(providerFailureArbitrary, { nil: null }),
        (toolName, generatedPolicy, providerAnswer, providerFailure) => {
          const evaluation = evaluateRiskGate({
            pendingToolCall: toolCall(toolName),
            riskGatePolicy: generatedPolicy,
            providerAnswer,
            providerFailure,
          });
          if (evaluation.verdict !== "allow") {
            return;
          }
          if (generatedPolicy.alwaysAllowedToolNames.includes(toolName)) {
            return;
          }
          const allowThreshold = findAllowThreshold(toolName, generatedPolicy);
          expect(providerFailure).toBeNull();
          expect(allowThreshold).not.toBeNull();
          expect(providerAnswer?.choice.trim().toLowerCase()).toBe("yes");
          expect(providerAnswer?.probability).toBeGreaterThanOrEqual(allowThreshold ?? 2);
        },
      ),
    );
  });

  it("is deterministic: the risk gate never samples (no exploration)", () => {
    fc.assert(
      fc.property(
        toolNameArbitrary,
        riskGatePolicyArbitrary,
        providerAnswerArbitrary,
        fc.option(providerFailureArbitrary, { nil: null }),
        (toolName, generatedPolicy, providerAnswer, providerFailure) => {
          const evaluationInput = {
            pendingToolCall: toolCall(toolName),
            riskGatePolicy: generatedPolicy,
            providerAnswer,
            providerFailure,
          };
          expect(evaluateRiskGate(evaluationInput)).toEqual(evaluateRiskGate(evaluationInput));
        },
      ),
    );
  });
});

describe.each(["constructor", "toString", "__proto__"])(
  "a tool named like an inherited object property: %s",
  (toolName) => {
    it("has no threshold unless the policy sets one", () => {
      expect(findAllowThreshold(toolName, riskGatePolicy)).toBeNull();
      expect(riskGateNeedsProviderAnswer(toolCall(toolName), riskGatePolicy)).toBe(false);
      expect(
        evaluateRiskGate({
          pendingToolCall: toolCall(toolName),
          riskGatePolicy,
          providerAnswer: answer("yes", 1),
          providerFailure: null,
        }),
      ).toEqual({ verdict: "askHuman", decisionStatus: "skippedUnsupported" });
    });

    it("uses its own threshold when the policy sets one (as JSON config would)", () => {
      const parsedPolicy: RiskGatePolicy = {
        blockedToolNames: [],
        alwaysAllowedToolNames: [],
        allowThresholdByToolName: JSON.parse(`{${JSON.stringify(toolName)}: 0.7}`),
      };
      expect(findAllowThreshold(toolName, parsedPolicy)).toBe(0.7);
      expect(riskGateNeedsProviderAnswer(toolCall(toolName), parsedPolicy)).toBe(true);
      const evaluationWith = (probability: number) =>
        evaluateRiskGate({
          pendingToolCall: toolCall(toolName),
          riskGatePolicy: parsedPolicy,
          providerAnswer: answer("yes", probability),
          providerFailure: null,
        });
      expect(evaluationWith(0.7)).toEqual({ verdict: "allow", decisionStatus: "answered" });
      expect(evaluationWith(0.69)).toEqual({ verdict: "askHuman", decisionStatus: "answered" });
    });
  },
);

describe("riskGateNeedsProviderAnswer", () => {
  it("is true only for a tool with a threshold that is on neither list", () => {
    expect(riskGateNeedsProviderAnswer(toolCall("sendEmail"), riskGatePolicy)).toBe(true);
    expect(riskGateNeedsProviderAnswer(toolCall("deleteDatabase"), riskGatePolicy)).toBe(false);
    expect(riskGateNeedsProviderAnswer(toolCall("readFile"), riskGatePolicy)).toBe(false);
    expect(riskGateNeedsProviderAnswer(toolCall("unknownTool"), riskGatePolicy)).toBe(false);
    expect(riskGateNeedsProviderAnswer(toolCall("constructor"), riskGatePolicy)).toBe(false);
    expect(riskGateNeedsProviderAnswer(toolCall("sendEmail"), null)).toBe(false);
  });
});

describe("findAllowThreshold", () => {
  it("reads only the tool's own threshold", () => {
    expect(findAllowThreshold("sendEmail", riskGatePolicy)).toBe(0.9);
    expect(findAllowThreshold("deleteDatabase", riskGatePolicy)).toBe(0);
    expect(findAllowThreshold("unknownTool", riskGatePolicy)).toBeNull();
    expect(findAllowThreshold("toString", riskGatePolicy)).toBeNull();
    expect(findAllowThreshold("__proto__", riskGatePolicy)).toBeNull();
    expect(findAllowThreshold("sendEmail", null)).toBeNull();
  });
});
