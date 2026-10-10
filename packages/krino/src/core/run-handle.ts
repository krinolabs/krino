import type {
  AgentStepTrace,
  DecisionAnswer,
  DecisionKind,
  DecisionMode,
  DecisionProvider,
  DecisionQuestion,
  DecisionRecord,
  ModelPrice,
  ModelRouteContext,
  ModelRouteOutcome,
  PendingToolCall,
  RiskGateOutcome,
  RunHandle,
  RunStartOptions,
  RunSummaryInput,
  StepContext,
  StepTraceInput,
  ToolDescription,
  ToolSelectionOutcome,
  TraceSink,
} from "../contracts/index.js";
import { TRACE_SCHEMA_VERSION } from "../contracts/index.js";
import { findModelPrice } from "../pricing/index.js";
import {
  buildRiskQuestion,
  evaluateRiskGate,
  type RiskGateEvaluation,
  riskGateNeedsProviderAnswer,
} from "../risk-gate/index.js";
import { askProviderWithTimeout, type ProviderCallResult } from "./ask-provider.js";
import {
  type ContextBudget,
  countSentCharacters,
  fitStepContextToBudget,
} from "./context-budget.js";
import { costFromUsage, estimateDecisionCostInUsd } from "./cost.js";
import { flushTraceSinkSafely } from "./flush-trace-sink.js";
import { createPendingDecisionTracker } from "./pending-decisions.js";
import type { ResolvedKrinoConfig } from "./resolve-config.js";
import {
  buildToolSelectionQuestions,
  encodeToolNameChoice,
  interpretToolSelectionAnswers,
} from "./tool-selection.js";

export type RunContext = {
  runIdentifier: string;
  runStart: RunStartOptions;
  resolvedConfig: ResolvedKrinoConfig;
  decisionProvider: DecisionProvider;
  traceSink: TraceSink;
  modelPrices: ReadonlyArray<ModelPrice>;
  contextBudget: ContextBudget;
  flushTimeoutInMilliseconds: number;
  currentTime: () => Date;
  monotonicTime: () => number;
  warn: (warningMessage: string) => void;
  /** Called once the run summary is written and the sink flushed. */
  onRunComplete: () => void;
};

export type ManagedRun = {
  runHandle: RunHandle;
  /** For `flushAll`: settle or cut off pending decisions, then write the steps that held for them. */
  settlePendingDecisions: (timeoutInMilliseconds: number) => Promise<void>;
};

/** A decision the runtime made. Its record is the source of truth and changes until final. */
type TrackedDecision = {
  stepNumber: number;
  decisionRecord: DecisionRecord;
  isFinal: boolean;
};

/** The run's step-0 tool selection, for the run summary's agreement metric. */
type StepZeroToolSelection = {
  trackedDecision: TrackedDecision;
  settledSuggestion: { latest: ToolSelectionSuggestion | null };
};

type HeldStep = {
  stepTrace: AgentStepTrace;
  adapterDecisions: Array<DecisionRecord>;
};

type ToolSelectionSuggestion = {
  decisionStatus: "answered" | "timedOut" | "failed";
  /** What enforce mode would send; `null` when there is no suggestion. */
  suggestedToolNames: Array<string> | null;
  probability: number | null;
  decisionModelVersion: string | null;
  latencyInMilliseconds: number;
};

function createDecisionRecord(
  decisionKind: DecisionKind,
  decisionMode: DecisionMode,
  recordFields: Partial<DecisionRecord>,
): DecisionRecord {
  return {
    decisionKind,
    decisionMode,
    decisionStatus: "skippedUnsupported",
    suggestedChoice: null,
    appliedChoice: null,
    probability: null,
    decisionModelVersion: null,
    latencyInMilliseconds: null,
    decisionCostInUsd: null,
    ...recordFields,
  };
}

/** Fail open: low confidence suggests all tools; a failure suggests nothing. */
function suggestToolSelection(
  providerCallResult: ProviderCallResult,
  availableTools: ReadonlyArray<ToolDescription>,
  minimumConfidence: number,
): ToolSelectionSuggestion {
  const latencyInMilliseconds = providerCallResult.latencyInMilliseconds;
  if (providerCallResult.resultKind === "timedOut") {
    return {
      decisionStatus: "timedOut",
      suggestedToolNames: null,
      probability: null,
      decisionModelVersion: null,
      latencyInMilliseconds,
    };
  }
  if (providerCallResult.resultKind === "failed") {
    return {
      decisionStatus: "failed",
      suggestedToolNames: null,
      probability: null,
      decisionModelVersion: null,
      latencyInMilliseconds,
    };
  }
  const interpretation = interpretToolSelectionAnswers(
    availableTools,
    providerCallResult.decisionAnswers,
  );
  if (interpretation.interpretationKind === "malformed") {
    return {
      decisionStatus: "failed",
      suggestedToolNames: null,
      probability: null,
      decisionModelVersion: null,
      latencyInMilliseconds,
    };
  }
  const isConfident = interpretation.probability >= minimumConfidence;
  return {
    decisionStatus: "answered",
    suggestedToolNames: isConfident
      ? interpretation.selectedToolNames
      : availableTools.map((toolDescription) => toolDescription.toolName),
    probability: interpretation.probability,
    decisionModelVersion: interpretation.decisionModelVersion,
    latencyInMilliseconds,
  };
}

function evaluateRiskAnswer(
  providerCallResult: ProviderCallResult,
  evaluationBase: Omit<
    Parameters<typeof evaluateRiskGate>[0],
    "providerAnswer" | "providerFailure"
  >,
): RiskGateEvaluation {
  if (providerCallResult.resultKind === "timedOut") {
    return evaluateRiskGate({
      ...evaluationBase,
      providerAnswer: null,
      providerFailure: "timedOut",
    });
  }
  if (providerCallResult.resultKind === "failed") {
    return evaluateRiskGate({ ...evaluationBase, providerAnswer: null, providerFailure: "failed" });
  }
  const [providerAnswer] = providerCallResult.decisionAnswers;
  if (providerCallResult.decisionAnswers.length !== 1 || providerAnswer === undefined) {
    return evaluateRiskGate({ ...evaluationBase, providerAnswer: null, providerFailure: "failed" });
  }
  return evaluateRiskGate({ ...evaluationBase, providerAnswer, providerFailure: null });
}

export function createManagedRun(runContext: RunContext): ManagedRun {
  const { runIdentifier, resolvedConfig, runStart, warn } = runContext;
  const tracker = createPendingDecisionTracker();
  const trackedDecisionsByStep = new Map<number, Array<TrackedDecision>>();
  const trackedDecisionBySnapshot = new Map<DecisionRecord, TrackedDecision>();
  const heldSteps: Array<HeldStep> = [];
  let runFinished = false;
  let finishPromise: Promise<void> | null = null;
  let toolSelectionCallCount = 0;
  let lockedToolNames: Array<string> | null = null;
  let latestTaskText = "";
  let latestAvailableTools: Array<ToolDescription> = [];
  let stepZeroToolSelection: StepZeroToolSelection | null = null;

  const hostSupports = (decisionKind: DecisionKind): boolean =>
    runStart.capabilities.supportedDecisions.includes(decisionKind);

  const writeRecordSafely = (traceRecord: Parameters<TraceSink["writeRecord"]>[0]): void => {
    try {
      runContext.traceSink.writeRecord(traceRecord);
    } catch (writeError) {
      warn(`krino: trace sink failed to write a record: ${String(writeError)}`);
    }
  };

  const mergeStepDecisions = (heldStep: HeldStep): Array<DecisionRecord> => {
    const runtimeDecisions = trackedDecisionsByStep.get(heldStep.stepTrace.stepNumber) ?? [];
    const usedDecisions = new Set<TrackedDecision>();
    const mergedDecisions = heldStep.adapterDecisions.map((adapterDecision) => {
      const trackedDecision = trackedDecisionBySnapshot.get(adapterDecision);
      if (trackedDecision === undefined) {
        return adapterDecision;
      }
      usedDecisions.add(trackedDecision);
      return { ...trackedDecision.decisionRecord };
    });
    for (const trackedDecision of runtimeDecisions) {
      if (!usedDecisions.has(trackedDecision)) {
        mergedDecisions.push({ ...trackedDecision.decisionRecord });
      }
    }
    return mergedDecisions;
  };

  /** Writes every held step whose decisions are all final. */
  const writeReadySteps = (): void => {
    for (const heldStep of [...heldSteps]) {
      const stepNumber = heldStep.stepTrace.stepNumber;
      const stepDecisions = trackedDecisionsByStep.get(stepNumber) ?? [];
      if (!stepDecisions.every((trackedDecision) => trackedDecision.isFinal)) {
        continue;
      }
      heldSteps.splice(heldSteps.indexOf(heldStep), 1);
      writeRecordSafely({ ...heldStep.stepTrace, decisions: mergeStepDecisions(heldStep) });
      trackedDecisionsByStep.delete(stepNumber);
    }
  };

  const finalizeDecision = (
    trackedDecision: TrackedDecision,
    finalFields: Partial<DecisionRecord>,
  ): void => {
    if (trackedDecision.isFinal) {
      return;
    }
    Object.assign(trackedDecision.decisionRecord, finalFields);
    trackedDecision.isFinal = true;
    writeReadySteps();
  };

  /** Starts tracking a decision and returns the snapshot handed to the adapter. */
  const trackDecision = (
    stepNumber: number,
    decisionRecord: DecisionRecord,
    isFinal: boolean,
  ): { trackedDecision: TrackedDecision; decisionSnapshot: DecisionRecord } => {
    const trackedDecision: TrackedDecision = { stepNumber, decisionRecord, isFinal };
    const stepDecisions = trackedDecisionsByStep.get(stepNumber) ?? [];
    stepDecisions.push(trackedDecision);
    trackedDecisionsByStep.set(stepNumber, stepDecisions);
    const decisionSnapshot = { ...decisionRecord };
    trackedDecisionBySnapshot.set(decisionSnapshot, trackedDecision);
    return { trackedDecision, decisionSnapshot };
  };

  /**
   * Estimated in v0.1: providers report no usage. The request was sent, so input is always
   * counted; output only for answers. Priced by the answer's model version, else the provider
   * name. `null` when neither has a price.
   */
  const estimateCost = (
    sentCharacterCount: number,
    decisionAnswers: ReadonlyArray<DecisionAnswer>,
  ): number | null => {
    const answeredModelVersion = decisionAnswers[0]?.decisionModelVersion;
    const modelPrice =
      (typeof answeredModelVersion === "string"
        ? findModelPrice(answeredModelVersion, runContext.modelPrices)
        : null) ?? findModelPrice(runContext.decisionProvider.providerName, runContext.modelPrices);
    if (modelPrice === null) {
      return null;
    }
    const answerCharacterCount = decisionAnswers.reduce(
      (characterTotal, decisionAnswer) =>
        characterTotal +
        (typeof decisionAnswer?.choice === "string" ? decisionAnswer.choice.length : 0),
      0,
    );
    return estimateDecisionCostInUsd({ sentCharacterCount, answerCharacterCount, modelPrice });
  };

  /**
   * Asks the provider and finalizes the decision with the result. The pending-decision tracker
   * can cut it off first; a late answer is then ignored. The returned promise never rejects.
   */
  const askInBackground = (
    trackedDecision: TrackedDecision,
    decisionQuestions: Array<DecisionQuestion>,
    stepContext: StepContext,
    finalFieldsFromResult: (providerCallResult: ProviderCallResult) => Partial<DecisionRecord>,
  ): Promise<void> => {
    const abortController = new AbortController();
    const sentCharacterCount = countSentCharacters(stepContext, decisionQuestions);
    const settled = askProviderWithTimeout({
      decisionProvider: runContext.decisionProvider,
      decisionQuestions,
      stepContext,
      timeoutInMilliseconds: resolvedConfig.decisionTimeoutInMilliseconds,
      abortController,
      monotonicTime: runContext.monotonicTime,
    })
      .then((providerCallResult) => {
        finalizeDecision(trackedDecision, {
          ...finalFieldsFromResult(providerCallResult),
          decisionCostInUsd: estimateCost(
            sentCharacterCount,
            providerCallResult.resultKind === "answered" ? providerCallResult.decisionAnswers : [],
          ),
        });
      })
      .catch((unexpectedError: unknown) => {
        warn(`krino: decision bookkeeping failed: ${String(unexpectedError)}`);
        finalizeDecision(trackedDecision, {});
      });
    tracker.track({
      settled,
      cutOff: () => {
        abortController.abort();
        finalizeDecision(trackedDecision, {
          decisionCostInUsd: estimateCost(sentCharacterCount, []),
        });
      },
    });
    return settled;
  };

  const settledToolSelection = (
    stepNumber: number,
    toolNamesToSend: Array<string>,
    recordFields: Partial<DecisionRecord>,
  ): ToolSelectionOutcome => {
    const decisionRecord = createDecisionRecord(
      "toolSelection",
      resolvedConfig.decisionModes.toolSelection,
      { appliedChoice: encodeToolNameChoice(toolNamesToSend), ...recordFields },
    );
    if (runFinished) {
      return { toolNamesToSend, decisionRecord };
    }
    const { decisionSnapshot } = trackDecision(stepNumber, decisionRecord, true);
    return { toolNamesToSend, decisionRecord: decisionSnapshot };
  };

  const decideToolSelectionSafely = async (
    stepContext: StepContext,
  ): Promise<ToolSelectionOutcome> => {
    const allToolNames = stepContext.availableTools.map(
      (toolDescription) => toolDescription.toolName,
    );
    const stepNumber = stepContext.stepNumber;
    const decisionMode = resolvedConfig.decisionModes.toolSelection;
    latestTaskText = stepContext.taskText;
    latestAvailableTools = [...stepContext.availableTools];

    if (decisionMode === "off") {
      return {
        toolNamesToSend: allToolNames,
        decisionRecord: createDecisionRecord("toolSelection", "off", {
          appliedChoice: encodeToolNameChoice(allToolNames),
        }),
      };
    }
    if (runFinished || !hostSupports("toolSelection")) {
      return settledToolSelection(stepNumber, allToolNames, {});
    }

    const isFirstCall = toolSelectionCallCount === 0;
    toolSelectionCallCount += 1;
    if (decisionMode === "enforce") {
      // The tool list may change only at step 0 / run start. Later changes break the prompt cache.
      const canChangeToolList =
        isFirstCall &&
        (runStart.capabilities.toolSelectionTiming === "runStartOnly" || stepNumber === 0);
      if (!canChangeToolList) {
        return settledToolSelection(stepNumber, lockedToolNames ?? allToolNames, {});
      }
    }
    if (allToolNames.length === 0) {
      return settledToolSelection(stepNumber, allToolNames, {});
    }

    const decisionQuestions = buildToolSelectionQuestions(stepContext.availableTools);
    const fittedContext = fitStepContextToBudget(
      stepContext,
      decisionQuestions,
      runContext.contextBudget,
    );
    if (!fittedContext.fitsBudget) {
      lockedToolNames = allToolNames;
      return settledToolSelection(stepNumber, allToolNames, { decisionStatus: "failed" });
    }

    const settledSuggestion: { latest: ToolSelectionSuggestion | null } = { latest: null };
    const finalFieldsFromResult = (
      providerCallResult: ProviderCallResult,
    ): Partial<DecisionRecord> => {
      const suggestion = suggestToolSelection(
        providerCallResult,
        stepContext.availableTools,
        resolvedConfig.minimumConfidence,
      );
      settledSuggestion.latest = suggestion;
      return {
        decisionStatus: suggestion.decisionStatus,
        suggestedChoice:
          suggestion.suggestedToolNames === null
            ? null
            : encodeToolNameChoice(suggestion.suggestedToolNames),
        probability: suggestion.probability,
        decisionModelVersion: suggestion.decisionModelVersion,
        latencyInMilliseconds: suggestion.latencyInMilliseconds,
      };
    };

    const isExploration =
      decisionMode === "enforce" && resolvedConfig.randomSource() < resolvedConfig.explorationRate;
    if (decisionMode === "shadow" || isExploration) {
      // Shadow and exploration send all tools now and record the suggestion when it arrives.
      const { trackedDecision, decisionSnapshot } = trackDecision(
        stepNumber,
        createDecisionRecord("toolSelection", decisionMode, {
          decisionStatus: isExploration ? "skippedExploration" : "cutOff",
          appliedChoice: encodeToolNameChoice(allToolNames),
        }),
        false,
      );
      if (isFirstCall && stepNumber === 0) {
        stepZeroToolSelection = { trackedDecision, settledSuggestion };
      }
      void askInBackground(
        trackedDecision,
        decisionQuestions,
        fittedContext.stepContext,
        (result) =>
          isExploration
            ? { ...finalFieldsFromResult(result), decisionStatus: "skippedExploration" }
            : finalFieldsFromResult(result),
      );
      lockedToolNames = allToolNames;
      return { toolNamesToSend: allToolNames, decisionRecord: decisionSnapshot };
    }

    // Enforce mode waits, bounded by the decision timeout.
    const { trackedDecision } = trackDecision(
      stepNumber,
      createDecisionRecord("toolSelection", "enforce", { decisionStatus: "cutOff" }),
      false,
    );
    if (isFirstCall && stepNumber === 0) {
      stepZeroToolSelection = { trackedDecision, settledSuggestion };
    }
    await askInBackground(
      trackedDecision,
      decisionQuestions,
      fittedContext.stepContext,
      finalFieldsFromResult,
    );
    const toolNamesToSend =
      trackedDecision.decisionRecord.decisionStatus === "answered"
        ? (settledSuggestion.latest?.suggestedToolNames ?? allToolNames)
        : allToolNames;
    trackedDecision.decisionRecord.appliedChoice = encodeToolNameChoice(toolNamesToSend);
    lockedToolNames = toolNamesToSend;
    const decisionSnapshot = { ...trackedDecision.decisionRecord };
    trackedDecisionBySnapshot.set(decisionSnapshot, trackedDecision);
    return { toolNamesToSend, decisionRecord: decisionSnapshot };
  };

  const decideToolSelection = async (stepContext: StepContext): Promise<ToolSelectionOutcome> => {
    try {
      return await decideToolSelectionSafely(stepContext);
    } catch (unexpectedError) {
      // Fail open: never throw into the host agent.
      warn(`krino: tool selection failed unexpectedly: ${String(unexpectedError)}`);
      const allToolNames = (stepContext.availableTools ?? []).map(
        (toolDescription) => toolDescription.toolName,
      );
      return {
        toolNamesToSend: allToolNames,
        decisionRecord: createDecisionRecord(
          "toolSelection",
          resolvedConfig.decisionModes.toolSelection,
          { decisionStatus: "failed", appliedChoice: encodeToolNameChoice(allToolNames) },
        ),
      };
    }
  };

  const settledRiskGate = (
    stepNumber: number,
    suggestedVerdict: RiskGateOutcome["suggestedVerdict"],
    recordFields: Partial<DecisionRecord>,
  ): RiskGateOutcome => {
    const decisionRecord = createDecisionRecord("riskGate", resolvedConfig.decisionModes.riskGate, {
      suggestedChoice: suggestedVerdict,
      ...recordFields,
    });
    if (runFinished) {
      return { verdictToApply: null, suggestedVerdict, decisionRecord };
    }
    const { decisionSnapshot } = trackDecision(stepNumber, decisionRecord, true);
    return { verdictToApply: null, suggestedVerdict, decisionRecord: decisionSnapshot };
  };

  const checkToolCallRiskSafely = async (
    pendingToolCall: PendingToolCall,
  ): Promise<RiskGateOutcome> => {
    const stepNumber = pendingToolCall.stepNumber;
    const decisionMode = resolvedConfig.decisionModes.riskGate;
    if (decisionMode === "off") {
      return {
        verdictToApply: null,
        suggestedVerdict: "askHuman",
        decisionRecord: createDecisionRecord("riskGate", "off", {}),
      };
    }
    if (runFinished || !hostSupports("riskGate")) {
      return settledRiskGate(stepNumber, "askHuman", { suggestedChoice: null });
    }

    const evaluationBase = { pendingToolCall, riskGatePolicy: resolvedConfig.riskGatePolicy };
    if (!riskGateNeedsProviderAnswer(pendingToolCall, resolvedConfig.riskGatePolicy)) {
      const evaluation = evaluateRiskGate({
        ...evaluationBase,
        providerAnswer: null,
        providerFailure: null,
      });
      return settledRiskGate(stepNumber, evaluation.verdict, {
        decisionStatus: evaluation.decisionStatus,
      });
    }

    const decisionQuestions = [buildRiskQuestion(pendingToolCall)];
    const stepContext: StepContext = {
      runIdentifier,
      stepNumber,
      taskText: latestTaskText,
      availableTools: latestAvailableTools.filter(
        (toolDescription) => toolDescription.toolName === pendingToolCall.toolName,
      ),
      // Never tool results or messages: they can carry prompt injection.
      recentMessagesText: "",
    };
    const fittedContext = fitStepContextToBudget(
      stepContext,
      decisionQuestions,
      runContext.contextBudget,
    );
    if (!fittedContext.fitsBudget) {
      const evaluation = evaluateRiskGate({
        ...evaluationBase,
        providerAnswer: null,
        providerFailure: "failed",
      });
      return settledRiskGate(stepNumber, evaluation.verdict, {
        decisionStatus: evaluation.decisionStatus,
      });
    }

    // v0.1: the risk gate is always shadow. Ask in the background; the host behaves as before.
    const { trackedDecision, decisionSnapshot } = trackDecision(
      stepNumber,
      createDecisionRecord("riskGate", decisionMode, { decisionStatus: "cutOff" }),
      false,
    );
    void askInBackground(
      trackedDecision,
      decisionQuestions,
      fittedContext.stepContext,
      (result) => {
        const evaluation = evaluateRiskAnswer(result, evaluationBase);
        const providerAnswer =
          result.resultKind === "answered" ? result.decisionAnswers[0] : undefined;
        return {
          decisionStatus: evaluation.decisionStatus,
          suggestedChoice: evaluation.verdict,
          probability: providerAnswer?.probability ?? null,
          decisionModelVersion: providerAnswer?.decisionModelVersion ?? null,
          latencyInMilliseconds: result.latencyInMilliseconds,
        };
      },
    );
    // Until the answer arrives, the suggestion fails closed.
    return { verdictToApply: null, suggestedVerdict: "askHuman", decisionRecord: decisionSnapshot };
  };

  const checkToolCallRisk = async (pendingToolCall: PendingToolCall): Promise<RiskGateOutcome> => {
    try {
      return await checkToolCallRiskSafely(pendingToolCall);
    } catch (unexpectedError) {
      // Fail closed: never throw into the host agent, never suggest `allow`.
      warn(`krino: risk gate failed unexpectedly: ${String(unexpectedError)}`);
      return {
        verdictToApply: null,
        suggestedVerdict: "askHuman",
        decisionRecord: createDecisionRecord("riskGate", resolvedConfig.decisionModes.riskGate, {
          decisionStatus: "failed",
          suggestedChoice: "askHuman",
        }),
      };
    }
  };

  const stepCostInUsd = (stepTrace: StepTraceInput): number | null => {
    if (stepTrace.costInUsd !== null || stepTrace.tokenUsage === null) {
      return stepTrace.costInUsd;
    }
    const modelPrice = findModelPrice(stepTrace.modelIdentifier, runContext.modelPrices);
    return modelPrice === null ? null : costFromUsage(stepTrace.tokenUsage, modelPrice);
  };

  const recordStep = (stepTrace: StepTraceInput): void => {
    if (runFinished) {
      return;
    }
    try {
      heldSteps.push({
        stepTrace: {
          ...stepTrace,
          traceSchemaVersion: TRACE_SCHEMA_VERSION,
          recordType: "agentStep",
          projectName: resolvedConfig.projectName,
          recordedAt: runContext.currentTime().toISOString(),
          costInUsd: stepCostInUsd(stepTrace),
        },
        adapterDecisions: [...stepTrace.decisions],
      });
      writeReadySteps();
    } catch (unexpectedError) {
      warn(`krino: failed to record a step: ${String(unexpectedError)}`);
    }
  };

  const settlePendingDecisions = async (timeoutInMilliseconds: number): Promise<void> => {
    try {
      await tracker.settleOrCutOff(timeoutInMilliseconds);
      writeReadySteps();
    } catch (unexpectedError) {
      warn(`krino: failed to settle pending decisions: ${String(unexpectedError)}`);
    }
  };

  /**
   * `true` when every used tool is inside the settled step-0 suggestion, `false` otherwise.
   * `null` without an answered step-0 suggestion (for example cut off, timed out or exploration).
   */
  const agreementWithStepZeroSuggestion = (
    usedToolNames: ReadonlyArray<string>,
  ): boolean | null => {
    if (stepZeroToolSelection === null || !Array.isArray(usedToolNames)) {
      return null;
    }
    const { trackedDecision, settledSuggestion } = stepZeroToolSelection;
    const suggestedToolNames = settledSuggestion.latest?.suggestedToolNames ?? null;
    if (
      trackedDecision.decisionRecord.decisionStatus !== "answered" ||
      suggestedToolNames === null
    ) {
      return null;
    }
    const suggestedToolNameSet = new Set(suggestedToolNames);
    return usedToolNames.every((toolName) => suggestedToolNameSet.has(toolName));
  };

  const finishRunSafely = async (runSummary: RunSummaryInput): Promise<void> => {
    const flushTimeout = runContext.flushTimeoutInMilliseconds;
    const deadline = runContext.monotonicTime() + flushTimeout;
    await settlePendingDecisions(flushTimeout);

    const orphanedDecisionCount = [...trackedDecisionsByStep.values()].reduce(
      (decisionTotal, stepDecisions) => decisionTotal + stepDecisions.length,
      0,
    );
    if (orphanedDecisionCount > 0) {
      warn(
        `krino: ${orphanedDecisionCount} decision(s) in run ${runIdentifier} had no step trace; ` +
          "call recordStep for every step that asked for a decision",
      );
      trackedDecisionsByStep.clear();
    }

    writeRecordSafely({
      ...runSummary,
      toolSelectionAgreement:
        runSummary.toolSelectionAgreement ??
        agreementWithStepZeroSuggestion(runSummary.usedToolNames),
      // TODO(WP-17): price the run at the suggested (shadow) or fallback (enforce) model.
      routingCounterfactualCostInUsd: null,
      runOutcome: runSummary.runOutcome ?? null,
      traceSchemaVersion: TRACE_SCHEMA_VERSION,
      recordType: "runSummary",
      projectName: resolvedConfig.projectName,
      recordedAt: runContext.currentTime().toISOString(),
    });

    const remainingTimeout = Math.max(0, deadline - runContext.monotonicTime());
    await flushTraceSinkSafely(runContext.traceSink, remainingTimeout, warn);
  };

  const finishRun = (runSummary: RunSummaryInput): Promise<void> => {
    if (finishPromise !== null) {
      return finishPromise;
    }
    runFinished = true;
    finishPromise = finishRunSafely(runSummary)
      .catch((unexpectedError: unknown) => {
        warn(`krino: failed to finish run ${runIdentifier}: ${String(unexpectedError)}`);
      })
      .finally(runContext.onRunComplete);
    return finishPromise;
  };

  // TODO(WP-17): real model routing (ADR-023). Until then the host keeps its model and the
  // returned record is not written to any step.
  const decideModelRoute = async (
    modelRouteContext: ModelRouteContext,
  ): Promise<ModelRouteOutcome> => ({
    modelIdentifierToUse: modelRouteContext.hostModelIdentifier,
    decisionRecord: createDecisionRecord(
      "modelRouting",
      resolvedConfig.decisionModes.modelRouting,
      { appliedChoice: modelRouteContext.hostModelIdentifier },
    ),
  });

  return {
    runHandle: {
      runIdentifier,
      decideToolSelection,
      decideModelRoute,
      checkToolCallRisk,
      recordStep,
      finishRun,
    },
    settlePendingDecisions,
  };
}
