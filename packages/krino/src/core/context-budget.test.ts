import { describe, expect, it } from "vitest";
import type { StepContext } from "../contracts/index.js";
import {
  estimateContextTokens,
  estimateTokenCount,
  fitStepContextToBudget,
  usableTokenCount,
} from "./context-budget.js";
import { buildToolSelectionQuestions } from "./tool-selection.js";

const defaultBudget = { budgetInTokens: 32_000, safetyMarginRatio: 0.1 };

function stepContext(contextFields: Partial<StepContext> = {}): StepContext {
  return {
    runIdentifier: "run-1",
    stepNumber: 0,
    taskText: "Summarize the open issues.",
    availableTools: [{ toolName: "search", toolDescription: "Search the issue tracker." }],
    recentMessagesText: "",
    ...contextFields,
  };
}

describe("token estimate", () => {
  it("is characters ÷ 4, rounded up", () => {
    expect(estimateTokenCount("")).toBe(0);
    expect(estimateTokenCount("abcd")).toBe(1);
    expect(estimateTokenCount("abcde")).toBe(2);
  });

  it("keeps a 10% margin of the 32,000-token budget", () => {
    expect(usableTokenCount(defaultBudget)).toBe(28_800);
  });
});

describe("fitStepContextToBudget", () => {
  it("leaves a context that fits unchanged", () => {
    const smallContext = stepContext({ recentMessagesText: "hello" });
    const fitted = fitStepContextToBudget(smallContext, [], defaultBudget);
    expect(fitted).toEqual({
      fitsBudget: true,
      stepContext: smallContext,
      trimmedCharacterCount: 0,
    });
  });

  it("trims recentMessagesText to fit 32,000 tokens and keeps the most recent text", () => {
    const oldText = "o".repeat(100_000);
    const recentText = "r".repeat(20_000);
    const largeContext = stepContext({ recentMessagesText: `${oldText}${recentText}` });
    const decisionQuestions = buildToolSelectionQuestions(largeContext.availableTools);

    const fitted = fitStepContextToBudget(largeContext, decisionQuestions, defaultBudget);

    expect(fitted.fitsBudget).toBe(true);
    if (!fitted.fitsBudget) {
      return;
    }
    expect(fitted.stepContext.recentMessagesText.endsWith(recentText)).toBe(true);
    expect(fitted.trimmedCharacterCount).toBeGreaterThan(0);
    expect(estimateContextTokens(fitted.stepContext, decisionQuestions)).toBeLessThanOrEqual(
      28_800,
    );
    // Uses the room it has: within one token of the usable budget.
    expect(estimateContextTokens(fitted.stepContext, decisionQuestions)).toBeGreaterThan(28_790);
  });

  it("fails when the parts it cannot trim are over budget", () => {
    const hugeTask = stepContext({
      taskText: "t".repeat(200_000),
      recentMessagesText: "some messages",
    });
    const fitted = fitStepContextToBudget(hugeTask, [], defaultBudget);
    expect(fitted).toEqual({ fitsBudget: false, estimatedTokens: 50_009, usableTokens: 28_800 });
  });

  it("drops all messages when only the fixed parts fit", () => {
    const exactTask = stepContext({
      taskText: "t".repeat(28_800 * 4),
      availableTools: [],
      recentMessagesText: "message",
    });
    const fitted = fitStepContextToBudget(exactTask, [], defaultBudget);
    expect(fitted.fitsBudget).toBe(true);
    if (fitted.fitsBudget) {
      expect(fitted.stepContext.recentMessagesText).toBe("");
    }
  });
});
