import type { DecisionRecord } from "../../contracts/index.js";

/** One tool call seen by krino's `PreToolUse` hook; recorded as one step. */
export type ToolCallStep = {
  /** 1-based index of the tool call within the run (subagent calls included). */
  stepNumber: number;
  toolName: string;
  riskDecisionRecord: DecisionRecord;
};

/** What the hook and the message observer share for one run. */
export type AgentRunState = {
  hostSdkVersion: string;
  /** The `model` option passed to `query()`, if any. */
  requestedModelIdentifier: string | null;
  /** The tools krino was told about (`toolDescriptions`), in order. */
  availableToolNames: Array<string>;
  toolSelectionLatencyInMilliseconds: number;
  toolCallCount: number;
  toolCallSteps: Array<ToolCallStep>;
  usedToolNames: Set<string>;
  finishPromise: Promise<void> | null;
};
