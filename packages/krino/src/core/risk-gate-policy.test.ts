import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { DecisionAnswer, PendingToolCall, RiskGatePolicy } from "../contracts/index.js";
import {
  buildRiskQuestion,
  evaluateRiskGate,
  type RiskGateProviderFailure,
  riskGateNeedsProviderAnswer,
} from "./risk-gate-policy.js";

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

describe("evaluateRiskGate (risk-gate column of the behavior rules)", () => {
  it.each([
    {
      situation: "block list wins over a safe answer with probability 1",
      toolName: "deleteDatabase",
      providerAnswer: answer("yes", 1),
      providerFailure: null,
      expected: { verdict: "block", decisionStatus: "answered" },
    },
    {
      situation: "allow list",
      toolName: "readFile",
      providerAnswer: null,
      providerFailure: null,
      expected: { verdict: "allow", decisionStatus: "answered" },
    },
    {
      situation: "tool has no threshold",
      toolName: "unknownTool",
      providerAnswer: answer("yes", 1),
      providerFailure: null,
      expected: { verdict: "askHuman", decisionStatus: "skippedUnsupported" },
    },
    {
      situation: "provider times out",
      toolName: "sendEmail",
      providerAnswer: null,
      providerFailure: "timedOut",
      expected: { verdict: "askHuman", decisionStatus: "timedOut" },
    },
    {
      situation: "provider error",
      toolName: "sendEmail",
      providerAnswer: null,
      providerFailure: "failed",
      expected: { verdict: "askHuman", decisionStatus: "failed" },
    },
    {
      situation: "probability below the threshold",
      toolName: "sendEmail",
      providerAnswer: answer("yes", 0.89),
      providerFailure: null,
      expected: { verdict: "askHuman", decisionStatus: "answered" },
    },
    {
      situation: "probability at the threshold",
      toolName: "sendEmail",
      providerAnswer: answer("yes", 0.9),
      providerFailure: null,
      expected: { verdict: "allow", decisionStatus: "answered" },
    },
    {
      situation: "confident unsafe answer asks a human, never blocks",
      toolName: "sendEmail",
      providerAnswer: answer("no", 0.99),
      providerFailure: null,
      expected: { verdict: "askHuman", decisionStatus: "answered" },
    },
    {
      situation: "no answer and no failure",
      toolName: "sendEmail",
      providerAnswer: null,
      providerFailure: null,
      expected: { verdict: "askHuman", decisionStatus: "failed" },
    },
    {
      situation: "non-finite probability",
      toolName: "sendEmail",
      providerAnswer: answer("yes", Number.NaN),
      providerFailure: null,
      expected: { verdict: "askHuman", decisionStatus: "failed" },
    },
  ] as const)("$situation", ({ toolName, providerAnswer, providerFailure, expected }) => {
    expect(
      evaluateRiskGate({
        pendingToolCall: toolCall(toolName),
        riskGatePolicy,
        providerAnswer,
        providerFailure,
      }),
    ).toEqual(expected);
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

  it("property: any provider failure never yields allow (fail closed)", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.dictionary(fc.string(), fc.double({ min: 0, max: 1, noNaN: true })),
        fc.array(fc.string()),
        fc.constantFrom<RiskGateProviderFailure>("timedOut", "failed"),
        fc.option(
          fc.record({
            choice: fc.oneof(fc.constant("yes"), fc.string()),
            probability: fc.double(),
            decisionModelVersion: fc.string(),
            latencyInMilliseconds: fc.nat(),
          }),
          { nil: null },
        ),
        (toolName, thresholds, allowList, providerFailure, providerAnswer) => {
          const evaluation = evaluateRiskGate({
            pendingToolCall: toolCall(toolName),
            riskGatePolicy: {
              blockedToolNames: [],
              // Only the explicit allow list may allow without an answer.
              alwaysAllowedToolNames: allowList.filter((allowedName) => allowedName !== toolName),
              allowThresholdByToolName: { ...thresholds, [toolName]: 0 },
            },
            providerAnswer,
            providerFailure,
          });
          return evaluation.verdict !== "allow";
        },
      ),
    );
  });
});

describe("riskGateNeedsProviderAnswer", () => {
  it("is true only for a tool with a threshold that is on neither list", () => {
    expect(riskGateNeedsProviderAnswer(toolCall("sendEmail"), riskGatePolicy)).toBe(true);
    expect(riskGateNeedsProviderAnswer(toolCall("deleteDatabase"), riskGatePolicy)).toBe(false);
    expect(riskGateNeedsProviderAnswer(toolCall("readFile"), riskGatePolicy)).toBe(false);
    expect(riskGateNeedsProviderAnswer(toolCall("unknownTool"), riskGatePolicy)).toBe(false);
    expect(riskGateNeedsProviderAnswer(toolCall("sendEmail"), null)).toBe(false);
  });
});

describe("buildRiskQuestion", () => {
  it("sends the tool name and structured arguments as a yes/no risk question", () => {
    const riskQuestion = buildRiskQuestion(toolCall("sendEmail", { to: "a@example.com" }));
    expect(riskQuestion.decisionKind).toBe("riskGate");
    expect(riskQuestion.options).toBeNull();
    expect(riskQuestion.questionText).toContain('"sendEmail"');
    expect(riskQuestion.questionText).toContain('{"to":"a@example.com"}');
  });

  it("survives arguments that cannot be serialized", () => {
    const circularArguments: Record<string, unknown> = {};
    circularArguments.self = circularArguments;
    expect(buildRiskQuestion(toolCall("sendEmail", circularArguments)).questionText).toContain(
      "could not be serialized",
    );
  });
});
