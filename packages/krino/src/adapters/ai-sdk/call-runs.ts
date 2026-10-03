import type { LanguageModelUsage, ModelMessage, ProviderMetadata, ToolSet } from "ai";
import type {
  DecisionRecord,
  HostCapabilities,
  KrinoRuntime,
  RunHandle,
  TokenUsageRecord,
} from "../../contracts/index.js";
import { costFromUsage } from "../../core/index.js";
import { DEFAULT_MODEL_PRICES, findModelPrice } from "../../pricing/index.js";
import { buildStepContext, describeTools } from "./step-context.js";
import { addTokenUsage, EMPTY_TOKEN_USAGE, tokenUsageFromStep } from "./token-usage.js";
import { warnOnce } from "./warn-once.js";
import type { ToolCallNotice } from "./wrap-tools.js";

export const AI_SDK_HOST_CAPABILITIES: HostCapabilities = {
  supportedDecisions: ["toolSelection", "riskGate"],
  toolSelectionTiming: "perStep",
  reportsPerStepUsage: true,
};

const HOST_NAME = "ai-sdk";

export const ACTIVE_TOOLS_CHANGED_WARNING =
  "krino: activeTools changed after step 0; this breaks the prompt cache.";
export const OPTIONS_REUSED_WARNING =
  "krino: withKrino options are in use by a run that has not finished; starting a separate run. " +
  "Call withKrino once per generateText or streamText call.";

// The parts of AI SDK events the adapter reads. Events carry more; it is passed on untouched.

export type CallStartEvent = { readonly callId: string; readonly modelId: string };

export type CallStepEndEvent = {
  readonly callId: string;
  readonly stepNumber: number;
  readonly model: { readonly modelId: string };
  readonly usage: LanguageModelUsage;
  readonly providerMetadata: ProviderMetadata | undefined;
  readonly toolCalls: ReadonlyArray<{ readonly toolName: string }>;
  readonly performance?: { readonly stepTimeMs: number };
};

export type ToolExecutionStartEvent = {
  readonly callId: string;
  readonly toolCall: { readonly toolCallId: string; readonly toolName: string };
};

export type PrepareStepInput = {
  readonly stepNumber: number;
  readonly steps: ReadonlyArray<{ readonly callId: string }>;
  readonly messages: Array<ModelMessage>;
};

/** One generateText or streamText call, which is one krino run. */
type CallRun = {
  callId: string | null;
  runHandle: RunHandle;
  modelIdentifier: string;
  currentStepNumber: number;
  /** The toolSelection snapshot for step 0's trace; the runtime matches it by identity. */
  toolSelectionDecision: DecisionRecord | null;
  /** Enforce mode: the tool list chosen at step 0, sent unchanged on every step. */
  lockedToolNames: Array<string> | null;
  /** Enforce mode with an answered suggestion: the suggested tools, for the agreement metric. */
  suggestedToolNames: Array<string> | null;
  stepZeroToolNames: Array<string> | null;
  sentToolNamesByStep: Map<number, Array<string>>;
  totalTokenUsage: TokenUsageRecord;
  totalCostInUsd: number;
  stepCount: number;
  usedToolNames: Array<string>;
  isFinished: boolean;
};

export type CallRunRegistry = {
  startCall: (startEvent: CallStartEvent) => void;
  /**
   * Returns the tool list krino sends this step (enforce mode), or `undefined` to leave the
   * step's tools as they are. `callerActiveTools` is what the caller's own prepareStep returned.
   */
  prepareStep: (
    prepareStepInput: PrepareStepInput,
    callerActiveTools: ReadonlyArray<string> | undefined,
  ) => Promise<Array<string> | undefined>;
  noteToolExecution: (toolExecutionEvent: ToolExecutionStartEvent) => void;
  /** Records a risk check for a tool call that is about to run. Never throws. */
  checkToolCall: (toolCallNotice: ToolCallNotice) => void;
  recordStep: (stepEndEvent: CallStepEndEvent) => void;
  finishCall: (callId: string) => void;
  finishAllCalls: () => void;
  hasActiveCalls: () => boolean;
};

export type CallRunRegistryOptions = {
  krinoRuntime: KrinoRuntime;
  hostSdkVersion: string;
  toolsByName: ReadonlyMap<string, ToolSet[string]>;
  /** The caller's `activeTools`, or every tool. */
  defaultToolNames: ReadonlyArray<string>;
};

function warn(warningMessage: string): void {
  console.warn(warningMessage);
}

function hasSameToolNames(
  leftToolNames: ReadonlyArray<string>,
  rightToolNames: ReadonlyArray<string>,
): boolean {
  // The SDK sends tools in the tool set's order, so the order of a name list does not matter.
  const leftNames = new Set(leftToolNames);
  const rightNames = new Set(rightToolNames);
  return leftNames.size === rightNames.size && [...leftNames].every((name) => rightNames.has(name));
}

/** Pricing with the default table; WP-07 moves the run total into the runtime (overrides too). */
function stepCostInUsd(tokenUsage: TokenUsageRecord, modelIdentifier: string): number {
  const modelPrice = findModelPrice(modelIdentifier, DEFAULT_MODEL_PRICES);
  return modelPrice === null ? 0 : costFromUsage(tokenUsage, modelPrice);
}

export function createCallRunRegistry(registryOptions: CallRunRegistryOptions): CallRunRegistry {
  const { krinoRuntime, hostSdkVersion, toolsByName } = registryOptions;
  const runsByCallId = new Map<string, CallRun>();
  /** Calls that started but have not reached step 0, oldest first. */
  const callIdsAwaitingStepZero: Array<string> = [];
  /** Runs started at step 0 without a known call id; bound to the next unknown call id. */
  const unboundRuns: Array<CallRun> = [];
  const callIdByToolCallId = new Map<string, string>();
  /** Finished calls; a late event for one of them is ignored, never bound to another run. */
  const finishedCallIds = new Set<string>();

  const knownToolNames = (toolNames: ReadonlyArray<string>): Array<string> => [
    ...new Set(toolNames.filter((toolName) => toolsByName.has(toolName))),
  ];
  const defaultToolNames = knownToolNames(registryOptions.defaultToolNames);

  const activeRunCount = (): number =>
    [...runsByCallId.values()].filter((callRun) => !callRun.isFinished).length + unboundRuns.length;

  const startCallRun = (callId: string | null, modelIdentifier: string): CallRun => {
    if (activeRunCount() > 0) {
      warnOnce("optionsReused", OPTIONS_REUSED_WARNING);
    }
    const runHandle = krinoRuntime.startRun({
      hostName: HOST_NAME,
      hostSdkVersion,
      capabilities: AI_SDK_HOST_CAPABILITIES,
    });
    return {
      callId,
      runHandle,
      modelIdentifier,
      currentStepNumber: 0,
      toolSelectionDecision: null,
      lockedToolNames: null,
      suggestedToolNames: null,
      stepZeroToolNames: null,
      sentToolNamesByStep: new Map(),
      totalTokenUsage: EMPTY_TOKEN_USAGE,
      totalCostInUsd: 0,
      stepCount: 0,
      usedToolNames: [],
      isFinished: false,
    };
  };

  /** The run for a call id; binds the oldest unbound run when the id is new. */
  const findCallRun = (callId: string | undefined): CallRun | null => {
    if (callId === undefined || finishedCallIds.has(callId)) {
      return null;
    }
    const knownRun = runsByCallId.get(callId);
    if (knownRun !== undefined) {
      return knownRun;
    }
    const unboundRun = unboundRuns.shift();
    if (unboundRun === undefined) {
      return null;
    }
    unboundRun.callId = callId;
    runsByCallId.set(callId, unboundRun);
    return unboundRun;
  };

  const startCall = (startEvent: CallStartEvent): void => {
    const callRun = startCallRun(startEvent.callId, startEvent.modelId);
    runsByCallId.set(startEvent.callId, callRun);
    callIdsAwaitingStepZero.push(startEvent.callId);
  };

  /** Step 0's run: calls reach step 0 in the order they started (same SDK code path). */
  const takeStepZeroRun = (): CallRun => {
    const callId = callIdsAwaitingStepZero.shift();
    const callRun = callId === undefined ? undefined : runsByCallId.get(callId);
    if (callRun !== undefined) {
      return callRun;
    }
    const unboundRun = startCallRun(null, "unknown");
    unboundRuns.push(unboundRun);
    return unboundRun;
  };

  const prepareStepZero = async (
    callRun: CallRun,
    prepareStepInput: PrepareStepInput,
    callerActiveTools: ReadonlyArray<string> | undefined,
  ): Promise<Array<string> | undefined> => {
    const availableToolNames =
      callerActiveTools === undefined ? defaultToolNames : knownToolNames(callerActiveTools);
    callRun.stepZeroToolNames = availableToolNames;
    callRun.sentToolNamesByStep.set(0, availableToolNames);
    const toolSelectionOutcome = await callRun.runHandle.decideToolSelection(
      buildStepContext({
        runIdentifier: callRun.runHandle.runIdentifier,
        stepNumber: 0,
        messages: prepareStepInput.messages,
        availableTools: describeTools(toolsByName, availableToolNames),
      }),
    );
    const decisionRecord = toolSelectionOutcome.decisionRecord;
    callRun.toolSelectionDecision = decisionRecord;
    if (decisionRecord.decisionMode !== "enforce") {
      // Shadow and off never change the tool list.
      return undefined;
    }
    const lockedToolNames = knownToolNames(toolSelectionOutcome.toolNamesToSend);
    callRun.lockedToolNames = lockedToolNames;
    callRun.stepZeroToolNames = lockedToolNames;
    callRun.sentToolNamesByStep.set(0, lockedToolNames);
    if (decisionRecord.decisionStatus === "answered") {
      callRun.suggestedToolNames = lockedToolNames;
    }
    return [...lockedToolNames];
  };

  const prepareLaterStep = (
    callRun: CallRun,
    stepNumber: number,
    callerActiveTools: ReadonlyArray<string> | undefined,
  ): Array<string> | undefined => {
    if (callerActiveTools !== undefined) {
      // The caller's own choice wins for this step. krino records it and warns once.
      const callerToolNames = knownToolNames(callerActiveTools);
      callRun.sentToolNamesByStep.set(stepNumber, callerToolNames);
      if (!hasSameToolNames(callerToolNames, callRun.stepZeroToolNames ?? defaultToolNames)) {
        warnOnce("activeToolsChanged", ACTIVE_TOOLS_CHANGED_WARNING);
      }
      return undefined;
    }
    // prepareStep's activeTools apply to one step only, so enforce mode resends the locked list.
    const lockedToolNames = callRun.lockedToolNames;
    callRun.sentToolNamesByStep.set(stepNumber, lockedToolNames ?? defaultToolNames);
    return lockedToolNames === null ? undefined : [...lockedToolNames];
  };

  const prepareStep: CallRunRegistry["prepareStep"] = async (
    prepareStepInput,
    callerActiveTools,
  ) => {
    try {
      const stepNumber = prepareStepInput.stepNumber;
      if (stepNumber === 0) {
        const callRun = takeStepZeroRun();
        callRun.currentStepNumber = 0;
        return await prepareStepZero(callRun, prepareStepInput, callerActiveTools);
      }
      const callRun = findCallRun(prepareStepInput.steps[0]?.callId);
      if (callRun === null || callRun.isFinished) {
        return undefined;
      }
      callRun.currentStepNumber = stepNumber;
      return prepareLaterStep(callRun, stepNumber, callerActiveTools);
    } catch (unexpectedError) {
      // Fail open: the step keeps its tools.
      warn(`krino: AI SDK adapter could not prepare a step: ${String(unexpectedError)}`);
      return undefined;
    }
  };

  const noteToolExecution = (toolExecutionEvent: ToolExecutionStartEvent): void => {
    callIdByToolCallId.set(toolExecutionEvent.toolCall.toolCallId, toolExecutionEvent.callId);
  };

  const checkToolCall = (toolCallNotice: ToolCallNotice): void => {
    const callId = callIdByToolCallId.get(toolCallNotice.toolCallId);
    callIdByToolCallId.delete(toolCallNotice.toolCallId);
    const callRun = findCallRun(callId);
    if (callRun === null || callRun.isFinished) {
      // Called outside a krino run (for example, directly by the caller): nothing to record.
      return;
    }
    const toolInput = toolCallNotice.toolInput;
    const toolArguments: Record<string, unknown> =
      typeof toolInput === "object" && toolInput !== null && !Array.isArray(toolInput)
        ? (toolInput as Record<string, unknown>)
        : { input: toolInput };
    const warnRiskFailure = (riskError: unknown): void => {
      warn(`krino: AI SDK adapter risk check failed: ${String(riskError)}`);
    };
    // v0.1: the risk gate is always shadow (verdictToApply is null). The check is recorded
    // synchronously and answered in the background; the tool runs at once, as before.
    try {
      callRun.runHandle
        .checkToolCallRisk({
          runIdentifier: callRun.runHandle.runIdentifier,
          stepNumber: callRun.currentStepNumber,
          toolName: toolCallNotice.toolName,
          toolArguments,
        })
        .catch(warnRiskFailure);
    } catch (riskError) {
      warnRiskFailure(riskError);
    }
  };

  const recordStep = (stepEndEvent: CallStepEndEvent): void => {
    try {
      const callRun = findCallRun(stepEndEvent.callId);
      if (callRun === null || callRun.isFinished) {
        return;
      }
      const stepNumber = stepEndEvent.stepNumber;
      const modelIdentifier = stepEndEvent.model.modelId;
      const tokenUsage = tokenUsageFromStep(stepEndEvent.usage, stepEndEvent.providerMetadata);
      const chosenToolNames = stepEndEvent.toolCalls.map((toolCall) => toolCall.toolName);
      const toolSelectionDecision = stepNumber === 0 ? callRun.toolSelectionDecision : null;
      callRun.runHandle.recordStep({
        runIdentifier: callRun.runHandle.runIdentifier,
        stepNumber,
        hostName: HOST_NAME,
        hostSdkVersion,
        modelIdentifier,
        availableToolNames: [
          ...(callRun.sentToolNamesByStep.get(stepNumber) ??
            callRun.lockedToolNames ??
            defaultToolNames),
        ],
        chosenToolNames,
        tokenUsage,
        // The runtime prices the step with its price table, overrides included.
        costInUsd: null,
        latencyInMilliseconds: stepEndEvent.performance?.stepTimeMs ?? null,
        decisions: toolSelectionDecision === null ? [] : [toolSelectionDecision],
        contentHash: null,
      });
      if (callRun.stepCount === 0) {
        callRun.modelIdentifier = modelIdentifier;
      }
      callRun.stepCount += 1;
      callRun.totalTokenUsage = addTokenUsage(callRun.totalTokenUsage, tokenUsage);
      callRun.totalCostInUsd += stepCostInUsd(tokenUsage, modelIdentifier);
      for (const toolName of chosenToolNames) {
        if (!callRun.usedToolNames.includes(toolName)) {
          callRun.usedToolNames.push(toolName);
        }
      }
    } catch (unexpectedError) {
      warn(`krino: AI SDK adapter could not record a step: ${String(unexpectedError)}`);
    }
  };

  const finishCallRun = (callRun: CallRun): void => {
    if (callRun.isFinished) {
      return;
    }
    callRun.isFinished = true;
    const suggestedToolNames = callRun.suggestedToolNames;
    const toolSelectionAgreement =
      suggestedToolNames === null
        ? null
        : callRun.usedToolNames.every((toolName) => suggestedToolNames.includes(toolName));
    // Not awaited: finishing waits for pending decisions and must not delay the host's result.
    callRun.runHandle
      .finishRun({
        runIdentifier: callRun.runHandle.runIdentifier,
        hostName: HOST_NAME,
        hostSdkVersion,
        modelIdentifier: callRun.modelIdentifier,
        totalTokenUsage: callRun.totalTokenUsage,
        totalCostInUsd: callRun.totalCostInUsd,
        stepCount: callRun.stepCount,
        usedToolNames: [...callRun.usedToolNames],
        toolSelectionAgreement,
      })
      .catch((finishError: unknown) => {
        warn(`krino: AI SDK adapter could not finish a run: ${String(finishError)}`);
      });
  };

  const finishCall = (callId: string): void => {
    try {
      const callRun = findCallRun(callId);
      if (callRun === null) {
        return;
      }
      const awaitingIndex = callIdsAwaitingStepZero.indexOf(callId);
      if (awaitingIndex >= 0) {
        callIdsAwaitingStepZero.splice(awaitingIndex, 1);
      }
      finishCallRun(callRun);
      runsByCallId.delete(callId);
      finishedCallIds.add(callId);
    } catch (unexpectedError) {
      warn(`krino: AI SDK adapter could not finish a run: ${String(unexpectedError)}`);
    }
  };

  const finishAllCalls = (): void => {
    for (const callId of [...runsByCallId.keys()]) {
      finishCall(callId);
    }
    for (const unboundRun of unboundRuns.splice(0)) {
      finishCallRun(unboundRun);
    }
    callIdsAwaitingStepZero.length = 0;
  };

  return {
    startCall,
    prepareStep,
    noteToolExecution,
    checkToolCall,
    recordStep,
    finishCall,
    finishAllCalls,
    hasActiveCalls: () => activeRunCount() > 0,
  };
}
