import { type BenchTask, CHARACTERS_PER_TOKEN } from "@krinolabs/bench";
import {
  MAX_STEP_COUNT,
  selectLogTriageTools,
  type ToolCount,
} from "@krinolabs/example-ai-sdk-cli/agent";
import { costFromUsage, type ModelPrice } from "@krinolabs/krino";
import {
  cachedPrefixTokenCount,
  FAKE_ANSWER_OUTPUT_TOKEN_COUNT,
  FAKE_PROMPT_TOKEN_COUNT,
  FAKE_TOKENS_PER_TOOL_RESULT,
  FAKE_TOOL_CALL_OUTPUT_TOKEN_COUNT,
} from "../fake/fake-agent-model.js";
import type { BenchSetupName } from "../plan/run-plan.js";

// What a run will cost, before it runs. It assumes the expected path (one step per expected tool,
// then the answer) with the same token shape the fake model uses, and that every tool-selection
// decision fails open: all tools on every step, so step 0 writes the cache and later steps read
// it. Pruning only makes a run cheaper. Prices come from the price table, cache reads and writes
// included, plus a margin for live runs that take extra steps. What the estimate misses (a router
// that changes a large list on every step) the in-run guard catches.

/** Live models take extra steps and longer answers than the expected path. */
export const ESTIMATE_SAFETY_FACTOR = 1.5;

/** Question text per tool in a tool-selection request ("Does the agent need the tool …"). */
const QUESTION_TOKENS_PER_TOOL = 25;
/** One risk-gate request: the task, the tool, its arguments and the question. */
const RISK_DECISION_TOKEN_COUNT = 300;
/** Answer characters per question (a yes/no choice). */
const ANSWER_TOKENS_PER_QUESTION = 1;

export type RunCostEstimateInputs = {
  setupName: BenchSetupName;
  toolCount: ToolCount;
  task: BenchTask;
  /** `null` prices the part at 0. */
  agentModelPrice: ModelPrice | null;
  decisionModelPrice: ModelPrice | null;
};

function priced(
  modelPrice: ModelPrice | null,
  tokenUsage: Parameters<typeof costFromUsage>[0],
): number {
  return modelPrice === null ? 0 : costFromUsage(tokenUsage, modelPrice);
}

export function estimateRunCostInUsd(estimateInputs: RunCostEstimateInputs): number {
  const { setupName, task } = estimateInputs;
  const toolDefinitions = selectLogTriageTools(estimateInputs.toolCount, task.expectedToolNames);
  // The full available list (fail open): a pruned list is smaller.
  const prefixTokenCount = cachedPrefixTokenCount(toolDefinitions);
  const stepCount = Math.min(task.expectedToolNames.length + 1, MAX_STEP_COUNT);

  let agentCostInUsd = 0;
  for (let stepIndex = 0; stepIndex < stepCount; stepIndex += 1) {
    const writesCache = stepIndex === 0;
    const isAnswerStep = stepIndex === stepCount - 1;
    agentCostInUsd += priced(estimateInputs.agentModelPrice, {
      inputTokens: FAKE_PROMPT_TOKEN_COUNT + stepIndex * FAKE_TOKENS_PER_TOOL_RESULT,
      outputTokens: isAnswerStep
        ? FAKE_ANSWER_OUTPUT_TOKEN_COUNT
        : FAKE_TOOL_CALL_OUTPUT_TOKEN_COUNT,
      cacheReadTokens: writesCache ? 0 : prefixTokenCount,
      cacheWriteTokens: writesCache ? prefixTokenCount : 0,
    });
  }

  const toolSelectionCount =
    setupName === "baseline" ? 0 : setupName === "step-zero" ? 1 : stepCount;
  const taskTokenCount = Math.ceil(task.taskText.length / CHARACTERS_PER_TOKEN);
  const toolSelectionCostInUsd = priced(estimateInputs.decisionModelPrice, {
    inputTokens:
      prefixTokenCount + toolDefinitions.length * QUESTION_TOKENS_PER_TOOL + taskTokenCount,
    outputTokens: toolDefinitions.length * ANSWER_TOKENS_PER_QUESTION,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  });
  const riskGateCostInUsd = priced(estimateInputs.decisionModelPrice, {
    inputTokens: RISK_DECISION_TOKEN_COUNT,
    outputTokens: ANSWER_TOKENS_PER_QUESTION,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  });
  const decisionCostInUsd =
    toolSelectionCount * toolSelectionCostInUsd + task.expectedToolNames.length * riskGateCostInUsd;

  return (agentCostInUsd + decisionCostInUsd) * ESTIMATE_SAFETY_FACTOR;
}
