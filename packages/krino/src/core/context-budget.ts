import type { DecisionQuestion, StepContext } from "../contracts/index.js";

const CHARACTERS_PER_TOKEN = 4;

export type ContextBudget = {
  budgetInTokens: number;
  /** Share of the budget kept free, because token counts are estimates. */
  safetyMarginRatio: number;
};

export type FittedStepContext =
  | { fitsBudget: true; stepContext: StepContext; trimmedCharacterCount: number }
  | { fitsBudget: false; estimatedTokens: number; usableTokens: number };

/** Tokens estimated as characters ÷ 4, rounded up. */
export function estimateTokenCount(text: string): number {
  return estimateTokensFromCharacters(text.length);
}

export function estimateTokensFromCharacters(characterCount: number): number {
  return Math.ceil(characterCount / CHARACTERS_PER_TOKEN);
}

export function usableTokenCount(contextBudget: ContextBudget): number {
  return Math.floor(contextBudget.budgetInTokens * (1 - contextBudget.safetyMarginRatio));
}

/** Everything sent to the provider except `recentMessagesText`, which is the only part we trim. */
function estimateFixedTokens(
  stepContext: StepContext,
  decisionQuestions: ReadonlyArray<DecisionQuestion>,
): number {
  const toolTokens = stepContext.availableTools.reduce(
    (tokenTotal, toolDescription) =>
      tokenTotal +
      estimateTokenCount(toolDescription.toolName) +
      estimateTokenCount(toolDescription.toolDescription),
    0,
  );
  const questionTokens = decisionQuestions.reduce(
    (tokenTotal, decisionQuestion) =>
      tokenTotal +
      estimateTokenCount(decisionQuestion.questionText) +
      estimateTokenCount((decisionQuestion.options ?? []).join("\n")),
    0,
  );
  return estimateTokenCount(stepContext.taskText) + toolTokens + questionTokens;
}

export function estimateContextTokens(
  stepContext: StepContext,
  decisionQuestions: ReadonlyArray<DecisionQuestion>,
): number {
  return (
    estimateFixedTokens(stepContext, decisionQuestions) +
    estimateTokenCount(stepContext.recentMessagesText)
  );
}

/** Every character sent to the provider: task, tools, questions, options and messages. */
export function countSentCharacters(
  stepContext: StepContext,
  decisionQuestions: ReadonlyArray<DecisionQuestion>,
): number {
  const toolCharacters = stepContext.availableTools.reduce(
    (characterTotal, toolDescription) =>
      characterTotal + toolDescription.toolName.length + toolDescription.toolDescription.length,
    0,
  );
  const questionCharacters = decisionQuestions.reduce(
    (characterTotal, decisionQuestion) =>
      characterTotal +
      decisionQuestion.questionText.length +
      (decisionQuestion.options ?? []).join("\n").length,
    0,
  );
  return (
    stepContext.taskText.length +
    toolCharacters +
    questionCharacters +
    stepContext.recentMessagesText.length
  );
}

/**
 * Fits the context to the budget: if it is over, keep the most recent part of
 * `recentMessagesText`, then check once more. Still over means the caller fails safe.
 */
export function fitStepContextToBudget(
  stepContext: StepContext,
  decisionQuestions: ReadonlyArray<DecisionQuestion>,
  contextBudget: ContextBudget,
): FittedStepContext {
  const usableTokens = usableTokenCount(contextBudget);
  if (estimateContextTokens(stepContext, decisionQuestions) <= usableTokens) {
    return { fitsBudget: true, stepContext, trimmedCharacterCount: 0 };
  }

  const tokensLeftForMessages = usableTokens - estimateFixedTokens(stepContext, decisionQuestions);
  const keptCharacterCount = Math.max(0, tokensLeftForMessages * CHARACTERS_PER_TOKEN);
  const recentMessagesText =
    keptCharacterCount === 0 ? "" : stepContext.recentMessagesText.slice(-keptCharacterCount);
  const trimmedStepContext: StepContext = { ...stepContext, recentMessagesText };

  // The one retry: re-check after trimming.
  const estimatedTokens = estimateContextTokens(trimmedStepContext, decisionQuestions);
  if (estimatedTokens > usableTokens) {
    return { fitsBudget: false, estimatedTokens, usableTokens };
  }
  return {
    fitsBudget: true,
    stepContext: trimmedStepContext,
    trimmedCharacterCount: stepContext.recentMessagesText.length - recentMessagesText.length,
  };
}
