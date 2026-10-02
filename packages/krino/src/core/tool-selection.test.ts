import { describe, expect, it } from "vitest";
import type { DecisionAnswer, ToolDescription } from "../contracts/index.js";
import {
  buildToolSelectionQuestions,
  encodeToolNameChoice,
  interpretToolSelectionAnswers,
} from "./tool-selection.js";

const availableTools: Array<ToolDescription> = [
  { toolName: "search", toolDescription: "Search the web." },
  { toolName: "readFile", toolDescription: "Read a file." },
  { toolName: "sendEmail", toolDescription: "Send an email." },
];

function answer(choice: string, probability: number): DecisionAnswer {
  return { choice, probability, decisionModelVersion: "jev-test", latencyInMilliseconds: 3 };
}

describe("encodeToolNameChoice", () => {
  it("sorts and joins tool names with commas", () => {
    expect(encodeToolNameChoice(["search", "readFile"])).toBe("readFile,search");
    expect(encodeToolNameChoice([])).toBe("");
  });

  it("does not reorder its input", () => {
    const toolNames = ["b", "a"];
    encodeToolNameChoice(toolNames);
    expect(toolNames).toEqual(["b", "a"]);
  });
});

describe("buildToolSelectionQuestions", () => {
  it("asks one yes/no question per tool, in order", () => {
    const decisionQuestions = buildToolSelectionQuestions(availableTools);
    expect(decisionQuestions).toHaveLength(3);
    expect(decisionQuestions.map((decisionQuestion) => decisionQuestion.options)).toEqual([
      null,
      null,
      null,
    ]);
    expect(decisionQuestions[1]?.questionText).toContain('"readFile"');
    expect(decisionQuestions[1]?.questionText).toContain("Read a file.");
    expect(decisionQuestions.every((question) => question.decisionKind === "toolSelection")).toBe(
      true,
    );
  });
});

describe("interpretToolSelectionAnswers", () => {
  it("selects the tools answered yes and keeps the weakest probability", () => {
    expect(
      interpretToolSelectionAnswers(availableTools, [
        answer("yes", 0.95),
        answer("No", 0.85),
        answer(" YES ", 0.9),
      ]),
    ).toEqual({
      interpretationKind: "selection",
      selectedToolNames: ["search", "sendEmail"],
      probability: 0.85,
      decisionModelVersion: "jev-test",
    });
  });

  it("rejects the wrong number of answers", () => {
    expect(interpretToolSelectionAnswers(availableTools, [answer("yes", 1)])).toMatchObject({
      interpretationKind: "malformed",
    });
  });

  it("rejects answers that are not yes or no", () => {
    expect(
      interpretToolSelectionAnswers(availableTools, [
        answer("yes", 1),
        answer("maybe", 1),
        answer("no", 1),
      ]),
    ).toMatchObject({ interpretationKind: "malformed" });
  });

  it.each([Number.NaN, -0.1, 1.1])("rejects probability %s", (badProbability) => {
    expect(
      interpretToolSelectionAnswers(availableTools, [
        answer("yes", 1),
        answer("no", badProbability),
        answer("no", 1),
      ]),
    ).toMatchObject({ interpretationKind: "malformed" });
  });
});
