import type { Experimental_EvaluationQuestion } from "ai";
import type { DecisionAnswer, DecisionQuestion, StepContext } from "../../contracts/index.js";

// Pure mapping between krino decisions and AI SDK evaluation questions. Type-only `ai` import.

/** The shared state Jev evaluates every question against. Tool results are never included. */
export type JevEvaluationState = {
  task: string;
  recentMessages: string;
  availableTools: Array<{ toolName: string; toolDescription: string }>;
};

export type JevEvaluationRequest = {
  state: JevEvaluationState;
  /** Keyed by `questionIdentifier(index)`, in the order of the decision questions. */
  questions: Record<string, Experimental_EvaluationQuestion>;
};

/** The answer shapes AI SDK returns from `experimental_evaluate` (EvaluationModelV4Answer). */
export type JevAnswer =
  | { type: "choice"; choice: string; probabilities?: Record<string, number> | undefined }
  | { type: "score"; score: number; probabilities?: Record<string, number> | undefined }
  | { type: "boolean"; probability: number };

export type JevAnswerContext = {
  decisionModelVersion: string;
  latencyInMilliseconds: number;
};

const YES_CHOICE = "yes";
const NO_CHOICE = "no";

/** Raised for anything the Jev answers cannot be mapped from. The caller wraps it. */
export class JevMappingError extends Error {
  override readonly name = "JevMappingError";
}

export function questionIdentifier(questionIndex: number): string {
  return `question_${questionIndex}`;
}

function evaluationQuestion(decisionQuestion: DecisionQuestion): Experimental_EvaluationQuestion {
  if (decisionQuestion.options === null) {
    return { type: "boolean", instructions: decisionQuestion.questionText };
  }
  const { options } = decisionQuestion;
  if (options.length === 0) {
    throw new JevMappingError("a choice question needs at least one option");
  }
  if (new Set(options).size !== options.length) {
    throw new JevMappingError("a choice question has duplicate options");
  }
  return {
    type: "choice",
    instructions: decisionQuestion.questionText,
    criteria: Object.fromEntries(options.map((option) => [option, null])),
  };
}

/** One request for all questions: yes/no → boolean, options → choice. */
export function buildJevEvaluationRequest(
  decisionQuestions: ReadonlyArray<DecisionQuestion>,
  stepContext: StepContext,
): JevEvaluationRequest {
  return {
    state: {
      task: stepContext.taskText,
      recentMessages: stepContext.recentMessagesText,
      availableTools: stepContext.availableTools.map(({ toolName, toolDescription }) => ({
        toolName,
        toolDescription,
      })),
    },
    questions: Object.fromEntries(
      decisionQuestions.map((decisionQuestion, questionIndex) => [
        questionIdentifier(questionIndex),
        evaluationQuestion(decisionQuestion),
      ]),
    ),
  };
}

/**
 * Jev returns P(true) for a boolean question. krino wants the choice and the probability of
 * that choice, so P(true) = 0.2 becomes "no" with probability 0.8. Ties go to "yes".
 */
export function yesNoFromProbabilityOfTrue(probabilityOfTrue: number): {
  choice: string;
  probability: number;
} {
  return probabilityOfTrue >= 0.5
    ? { choice: YES_CHOICE, probability: probabilityOfTrue }
    : { choice: NO_CHOICE, probability: 1 - probabilityOfTrue };
}

function isProbability(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function mapOneAnswer(
  decisionQuestion: DecisionQuestion,
  jevAnswer: JevAnswer | undefined,
  answerLabel: string,
): { choice: string; probability: number } {
  if (jevAnswer === undefined) {
    throw new JevMappingError(`Jev returned no answer for ${answerLabel}`);
  }
  if (decisionQuestion.options === null) {
    if (jevAnswer.type !== "boolean" || !isProbability(jevAnswer.probability)) {
      throw new JevMappingError(`Jev returned a malformed yes/no answer for ${answerLabel}`);
    }
    return yesNoFromProbabilityOfTrue(jevAnswer.probability);
  }
  if (jevAnswer.type !== "choice" || !decisionQuestion.options.includes(jevAnswer.choice)) {
    throw new JevMappingError(`Jev returned a malformed choice answer for ${answerLabel}`);
  }
  const choiceProbability = jevAnswer.probabilities?.[jevAnswer.choice];
  if (!isProbability(choiceProbability)) {
    // No distribution means no probability for the choice; krino never invents one.
    throw new JevMappingError(`Jev returned no probability for the choice in ${answerLabel}`);
  }
  return { choice: jevAnswer.choice, probability: choiceProbability };
}

/** One `DecisionAnswer` per question, in question order. Throws `JevMappingError`. */
export function decisionAnswersFromJev(
  decisionQuestions: ReadonlyArray<DecisionQuestion>,
  jevAnswers: Readonly<Record<string, JevAnswer>>,
  answerContext: JevAnswerContext,
): Array<DecisionAnswer> {
  return decisionQuestions.map((decisionQuestion, questionIndex) => {
    const answerIdentifier = questionIdentifier(questionIndex);
    const { choice, probability } = mapOneAnswer(
      decisionQuestion,
      jevAnswers[answerIdentifier],
      answerIdentifier,
    );
    return {
      choice,
      probability,
      decisionModelVersion: answerContext.decisionModelVersion,
      latencyInMilliseconds: answerContext.latencyInMilliseconds,
    };
  });
}
