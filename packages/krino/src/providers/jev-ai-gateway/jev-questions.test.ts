import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { DecisionQuestion, StepContext } from "../../contracts/index.js";
import {
  buildJevEvaluationRequest,
  decisionAnswersFromJev,
  JevMappingError,
  yesNoFromProbabilityOfTrue,
} from "./jev-questions.js";

const stepContext: StepContext = {
  runIdentifier: "run-1",
  stepNumber: 3,
  taskText: "Summarize the open issues.",
  availableTools: [{ toolName: "search", toolDescription: "Search the issue tracker." }],
  recentMessagesText: "user: what is still open?",
};
const yesNoQuestion: DecisionQuestion = {
  decisionKind: "toolSelection",
  questionText: 'Does the agent need the tool "search"?',
  options: null,
};
const choiceQuestion: DecisionQuestion = {
  decisionKind: "toolSelection",
  questionText: "Which tool should run first?",
  options: ["search", "readFile"],
};
const answerContext = { decisionModelVersion: "typesafe-ai/jev-test", latencyInMilliseconds: 42 };

describe("buildJevEvaluationRequest", () => {
  it("puts every question in one request against one shared state", () => {
    expect(buildJevEvaluationRequest([yesNoQuestion, choiceQuestion], stepContext)).toEqual({
      state: {
        task: "Summarize the open issues.",
        recentMessages: "user: what is still open?",
        availableTools: [{ toolName: "search", toolDescription: "Search the issue tracker." }],
      },
      questions: {
        question_0: { type: "boolean", instructions: 'Does the agent need the tool "search"?' },
        question_1: {
          type: "choice",
          instructions: "Which tool should run first?",
          criteria: { search: null, readFile: null },
        },
      },
    });
  });

  it("leaves run identifiers out of the state", () => {
    const { state } = buildJevEvaluationRequest([yesNoQuestion], stepContext);
    expect(JSON.stringify(state)).not.toContain("run-1");
  });

  it.each([
    ["no options", []],
    ["duplicate options", ["search", "search"]],
  ])("rejects a choice question with %s", (_label, options) => {
    expect(() => buildJevEvaluationRequest([{ ...choiceQuestion, options }], stepContext)).toThrow(
      JevMappingError,
    );
  });
});

describe("yesNoFromProbabilityOfTrue", () => {
  it.each([
    [0.97, { choice: "yes", probability: 0.97 }],
    [0.5, { choice: "yes", probability: 0.5 }],
    [0.2, { choice: "no", probability: 0.8 }],
    [0, { choice: "no", probability: 1 }],
  ])("P(true) = %s maps to %o", (probabilityOfTrue, expected) => {
    const mapped = yesNoFromProbabilityOfTrue(probabilityOfTrue);
    expect(mapped.choice).toBe(expected.choice);
    expect(mapped.probability).toBeCloseTo(expected.probability, 10);
  });

  it("always reports a probability of at least 0.5 for the chosen side", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (probabilityOfTrue) => {
        const { probability } = yesNoFromProbabilityOfTrue(probabilityOfTrue);
        return probability >= 0.5 && probability <= 1;
      }),
    );
  });
});

describe("decisionAnswersFromJev", () => {
  it("maps boolean and choice answers in question order", () => {
    expect(
      decisionAnswersFromJev(
        [yesNoQuestion, choiceQuestion],
        {
          question_1: {
            type: "choice",
            choice: "readFile",
            probabilities: { search: 0.3, readFile: 0.7 },
          },
          question_0: { type: "boolean", probability: 0.1 },
        },
        answerContext,
      ),
    ).toEqual([
      { choice: "no", probability: 0.9, ...answerContext },
      { choice: "readFile", probability: 0.7, ...answerContext },
    ]);
  });

  it.each([
    ["a missing answer", {}],
    ["a choice answer to a yes/no question", { question_0: { type: "choice", choice: "yes" } }],
    ["a probability outside 0..1", { question_0: { type: "boolean", probability: 1.2 } }],
  ] as const)("rejects %s", (_label, jevAnswers) => {
    expect(() => decisionAnswersFromJev([yesNoQuestion], jevAnswers, answerContext)).toThrow(
      JevMappingError,
    );
  });

  it("rejects a choice answer without a probability rather than inventing one", () => {
    expect(() =>
      decisionAnswersFromJev(
        [choiceQuestion],
        { question_0: { type: "choice", choice: "search" } },
        answerContext,
      ),
    ).toThrow(/no probability/);
  });

  it("rejects a choice that is not one of the options", () => {
    expect(() =>
      decisionAnswersFromJev(
        [choiceQuestion],
        { question_0: { type: "choice", choice: "sendEmail", probabilities: { sendEmail: 1 } } },
        answerContext,
      ),
    ).toThrow(JevMappingError);
  });
});
