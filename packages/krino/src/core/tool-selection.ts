import type { DecisionAnswer, DecisionQuestion, ToolDescription } from "../contracts/index.js";

const YES_CHOICE = "yes";
const NO_CHOICE = "no";

/** Tool names in the `DecisionRecord` choice encoding: sorted, joined with `,`. */
export function encodeToolNameChoice(toolNames: ReadonlyArray<string>): string {
  return [...toolNames].sort().join(",");
}

/** One yes/no question per tool, in the order of `availableTools`. */
export function buildToolSelectionQuestions(
  availableTools: ReadonlyArray<ToolDescription>,
): Array<DecisionQuestion> {
  return availableTools.map((toolDescription) => ({
    decisionKind: "toolSelection",
    questionText:
      `Does the agent need the tool "${toolDescription.toolName}" to complete this task? ` +
      `Tool description: ${toolDescription.toolDescription}`,
    options: null,
  }));
}

export type ToolSelectionInterpretation =
  | {
      interpretationKind: "selection";
      selectedToolNames: Array<string>;
      /** The weakest answer: a selection is only as sure as its least sure part. */
      probability: number;
      decisionModelVersion: string;
    }
  | { interpretationKind: "malformed"; reason: string };

function normalizedYesNo(choice: string): "yes" | "no" | null {
  const normalizedChoice = choice.trim().toLowerCase();
  if (normalizedChoice === YES_CHOICE || normalizedChoice === NO_CHOICE) {
    return normalizedChoice;
  }
  return null;
}

function isValidProbability(probability: number): boolean {
  return Number.isFinite(probability) && probability >= 0 && probability <= 1;
}

/** Reads one answer per question. Anything malformed is treated as a provider failure. */
export function interpretToolSelectionAnswers(
  availableTools: ReadonlyArray<ToolDescription>,
  decisionAnswers: ReadonlyArray<DecisionAnswer>,
): ToolSelectionInterpretation {
  if (decisionAnswers.length !== availableTools.length) {
    return {
      interpretationKind: "malformed",
      reason: `expected ${availableTools.length} answers, got ${decisionAnswers.length}`,
    };
  }

  const selectedToolNames: Array<string> = [];
  let weakestProbability = 1;
  for (const [answerIndex, decisionAnswer] of decisionAnswers.entries()) {
    const yesOrNo = normalizedYesNo(decisionAnswer.choice);
    if (yesOrNo === null || !isValidProbability(decisionAnswer.probability)) {
      return {
        interpretationKind: "malformed",
        reason: `answer ${answerIndex} is not a yes/no answer with a probability in 0..1`,
      };
    }
    const toolDescription = availableTools[answerIndex];
    if (yesOrNo === YES_CHOICE && toolDescription !== undefined) {
      selectedToolNames.push(toolDescription.toolName);
    }
    weakestProbability = Math.min(weakestProbability, decisionAnswer.probability);
  }

  return {
    interpretationKind: "selection",
    selectedToolNames,
    probability: weakestProbability,
    decisionModelVersion: decisionAnswers[0]?.decisionModelVersion ?? "unknown",
  };
}
