// Per-run scores, as bench/README.md defines them. Pure functions; names compare exactly, and
// every lookup by tool name goes through a Set, so names like `__proto__` are plain values.

/** One agent step: the tools sent to the model and the tools it called, in call order. */
export type ObservedStep = {
  offeredToolNames: ReadonlyArray<string>;
  calledToolNames: ReadonlyArray<string>;
};

/** Step-0 recall (secondary): every expected tool is in the set sent on step 0. */
export function scoreStepZeroRecall(
  expectedToolNames: ReadonlyArray<string>,
  observedSteps: ReadonlyArray<ObservedStep>,
): boolean {
  const stepZero = observedSteps[0];
  if (stepZero === undefined) {
    return false;
  }
  const offeredToolNames = new Set(stepZero.offeredToolNames);
  return expectedToolNames.every((toolName) => offeredToolNames.has(toolName));
}

type StepCall = { stepIndex: number; toolName: string };

function flattenCalls(observedSteps: ReadonlyArray<ObservedStep>): Array<StepCall> {
  return observedSteps.flatMap((observedStep, stepIndex) =>
    observedStep.calledToolNames.map((toolName) => ({ stepIndex, toolName })),
  );
}

/**
 * Recall at the step the tool was needed (primary). Walks the expected tools in order:
 * - a tool the agent called (first call after the previous match) is needed on that step;
 * - a tool it never called is needed on the step after the previous expected tool's step
 *   (step 0 for the first tool).
 * Each tool must be offered on its step. A run that ends before that step misses the tool.
 */
export function scoreRecallAtNeededStep(
  expectedToolNames: ReadonlyArray<string>,
  observedSteps: ReadonlyArray<ObservedStep>,
): boolean {
  const stepCalls = flattenCalls(observedSteps);
  let callCursor = -1;
  let previousStepIndex: number | null = null;
  for (const expectedToolName of expectedToolNames) {
    const matchedCallIndex = stepCalls.findIndex(
      (stepCall, callIndex) => callIndex > callCursor && stepCall.toolName === expectedToolName,
    );
    const matchedCall = stepCalls[matchedCallIndex];
    let neededStepIndex: number;
    if (matchedCall === undefined) {
      neededStepIndex = previousStepIndex === null ? 0 : previousStepIndex + 1;
    } else {
      neededStepIndex = matchedCall.stepIndex;
      callCursor = matchedCallIndex;
    }
    const neededStep = observedSteps[neededStepIndex];
    if (neededStep === undefined || !new Set(neededStep.offeredToolNames).has(expectedToolName)) {
      return false;
    }
    previousStepIndex = neededStepIndex;
  }
  return true;
}

export type KeptShare = { keptCount: number; keptShare: number };

/** Set size: tools sent on step 0 over the tools the run had available. */
export function measureKeptShare(
  observedSteps: ReadonlyArray<ObservedStep>,
  availableToolCount: number,
): KeptShare {
  const keptCount = new Set(observedSteps[0]?.offeredToolNames ?? []).size;
  return {
    keptCount,
    keptShare: availableToolCount > 0 ? keptCount / availableToolCount : 0,
  };
}

export type SequenceMatch = {
  /** `expectedToolNames` is an ordered subsequence of the calls. */
  isMatched: boolean;
  matchedCount: number;
  /** Calls not matched to an expected tool; a repeated expected call counts as extra. */
  extraCallCount: number;
};

/** Sequence match and extra calls (multiStep tasks only). */
export function matchExpectedSequence(
  expectedToolNames: ReadonlyArray<string>,
  calledToolNames: ReadonlyArray<string>,
): SequenceMatch {
  let matchedCount = 0;
  for (const calledToolName of calledToolNames) {
    if (calledToolName === expectedToolNames[matchedCount]) {
      matchedCount += 1;
    }
  }
  return {
    isMatched: matchedCount === expectedToolNames.length,
    matchedCount,
    extraCallCount: calledToolNames.length - matchedCount,
  };
}
