import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { StepTraceInput } from "../../contracts/index.js";
import type { AgentRunState } from "./agent-run-state.js";
import {
  CLAUDE_AGENT_SDK_HOST_NAME,
  findAgentRunState,
  type KrinoAgentRun,
} from "./krino-agent-options.js";
import { mainModelIdentifier, totalTokenUsageFrom } from "./run-usage.js";
import { warnOncePerProcess } from "./warn-once.js";

const UNKNOWN_MODEL_IDENTIFIER = "unknown";

const FOREIGN_RUN_WARNING_KEY = "foreignRun";
const FOREIGN_RUN_WARNING =
  "krino: observeKrinoMessages() got a run that krinoAgentOptions() did not return; " +
  "nothing is recorded. Pass the object krinoAgentOptions() resolved to.";

export type ObserveKrinoMessagesOptions = {
  /**
   * Default `true`: when the stream ends, wait until the run's traces are written. The runtime
   * waits only while decisions are still pending, at most the flush timeout (2 s by default), so
   * a short script can exit right after its loop without losing traces. `false`: end the loop at
   * once and write the traces in the background; a process that exits right away may lose them.
   */
  waitForTracesOnEnd?: boolean;
};

/** The fields krino reads from a `result` message. */
type RunResult = {
  modelUsage: unknown;
  totalCostInUsd: number;
  turnCount: number | null;
};

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function runResultFrom(message: SDKMessage): RunResult | null {
  if (message.type !== "result") {
    return null;
  }
  return {
    modelUsage: message.modelUsage,
    totalCostInUsd: finiteOrNull(message.total_cost_usd) ?? 0,
    turnCount: finiteOrNull(message.num_turns),
  };
}

/** Writes step 0, one step per tool call, and the run summary. Runs once per run. */
async function finishAgentRun(
  krinoRun: KrinoAgentRun,
  runState: AgentRunState,
  lastResult: RunResult | null,
): Promise<void> {
  const { runHandle, toolSelection } = krinoRun;
  const modelIdentifier =
    mainModelIdentifier(runState.requestedModelIdentifier, lastResult?.modelUsage) ??
    UNKNOWN_MODEL_IDENTIFIER;
  const sharedStepFields = {
    runIdentifier: runHandle.runIdentifier,
    hostName: CLAUDE_AGENT_SDK_HOST_NAME,
    hostSdkVersion: runState.hostSdkVersion,
    modelIdentifier,
    availableToolNames: [...runState.availableToolNames],
    // The Agent SDK reports usage per run only.
    tokenUsage: null,
    costInUsd: null,
    contentHash: null,
  } satisfies Partial<StepTraceInput>;

  runHandle.recordStep({
    ...sharedStepFields,
    stepNumber: 0,
    chosenToolNames: [],
    latencyInMilliseconds: runState.toolSelectionLatencyInMilliseconds,
    decisions: [toolSelection.decisionRecord],
  });
  const toolCallSteps = [...runState.toolCallSteps].sort(
    (firstStep, secondStep) => firstStep.stepNumber - secondStep.stepNumber,
  );
  for (const toolCallStep of toolCallSteps) {
    runHandle.recordStep({
      ...sharedStepFields,
      stepNumber: toolCallStep.stepNumber,
      chosenToolNames: [toolCallStep.toolName],
      latencyInMilliseconds: null,
      decisions: [toolCallStep.riskDecisionRecord],
    });
  }

  await runHandle.finishRun({
    runIdentifier: runHandle.runIdentifier,
    hostName: CLAUDE_AGENT_SDK_HOST_NAME,
    hostSdkVersion: runState.hostSdkVersion,
    modelIdentifier,
    totalTokenUsage: totalTokenUsageFrom(lastResult?.modelUsage),
    totalCostInUsd: lastResult?.totalCostInUsd ?? 0,
    stepCount: lastResult?.turnCount ?? runState.toolCallCount,
    usedToolNames: [...runState.usedToolNames].sort(),
    // The runtime fills it from the settled step-0 suggestion: shadow suggestions settle in the
    // background, where the adapter cannot see them.
    toolSelectionAgreement: null,
  });
}

function finishAgentRunOnce(
  krinoRun: KrinoAgentRun,
  runState: AgentRunState,
  lastResult: RunResult | null,
): Promise<void> {
  runState.finishPromise ??= finishAgentRun(krinoRun, runState, lastResult).catch(
    (unexpectedError: unknown) => {
      console.warn(`krino: failed to finish the Claude Agent SDK run: ${String(unexpectedError)}`);
    },
  );
  return runState.finishPromise;
}

/**
 * Passes every message of a `query()` stream through unchanged. When the stream ends (finished,
 * thrown, or left early with `break`), it records the run: step 0, one step per tool call, usage
 * and cost from the last `result` message (cumulative), then `finishRun`. The host's own stream
 * errors are rethrown; krino's never are.
 *
 * Waiting at the end (`waitForTracesOnEnd`, default `true`): the loop ends once pending decisions
 * settle or are cut off, at most the flush timeout (2 s by default), and right away when nothing
 * is pending. The trade-off: up to 2 s at the end of a run in exchange for traces that survive an
 * immediate process exit. Pass `false` to end the loop at once and write in the background.
 *
 * Trace lines are not in order; sort by runIdentifier, then stepNumber. (The runtime writes a step
 * once its decisions settle, so step 0, waiting on a background suggestion, can follow step 1.)
 */
export async function* observeKrinoMessages<Message extends SDKMessage>(
  messageStream: AsyncIterable<Message>,
  krinoRun: KrinoAgentRun,
  observeOptions: ObserveKrinoMessagesOptions = {},
): AsyncGenerator<Message, void, undefined> {
  const runState = findAgentRunState(krinoRun);
  if (runState === undefined) {
    warnOncePerProcess(FOREIGN_RUN_WARNING_KEY, FOREIGN_RUN_WARNING);
    yield* messageStream;
    return;
  }

  let lastResult: RunResult | null = null;
  try {
    for await (const message of messageStream) {
      lastResult = runResultFrom(message) ?? lastResult;
      yield message;
    }
  } finally {
    // Never rejects: failures are logged inside.
    const finishPromise = finishAgentRunOnce(krinoRun, runState, lastResult);
    if (observeOptions.waitForTracesOnEnd ?? true) {
      await finishPromise;
    }
  }
}
