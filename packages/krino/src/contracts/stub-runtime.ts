import type { KrinoConfig } from "./config.js";
import type { DecisionKind } from "./decisions.js";
import type { PendingToolCall, StepContext } from "./host.js";
import type {
  KrinoRuntime,
  RiskGateOutcome,
  RunHandle,
  RunStartOptions,
  RunSummaryInput,
  StepTraceInput,
  ToolSelectionOutcome,
} from "./runtime.js";
import {
  type AgentStepTrace,
  type DecisionRecord,
  type RunSummaryTrace,
  TRACE_SCHEMA_VERSION,
} from "./trace.js";

// Stand-in for the WP-02 runtime so adapters can be built and tested before it merges.
// It never asks a provider: every outcome is a shadow outcome, and every trace stays in memory.

export type StubRuntimeOptions = {
  /** Clock for `recordedAt`. Default: the system clock. */
  currentTime?: () => Date;
};

export type StartedStubRun = RunStartOptions & { runIdentifier: string };

export type StubKrinoRuntime = KrinoRuntime & {
  readonly startedRuns: ReadonlyArray<StartedStubRun>;
  readonly toolSelectionRequests: ReadonlyArray<StepContext>;
  readonly riskGateRequests: ReadonlyArray<PendingToolCall>;
  readonly writtenTraces: ReadonlyArray<AgentStepTrace | RunSummaryTrace>;
  readonly flushTimeouts: ReadonlyArray<number>;
};

/** Tool names in the `DecisionRecord` choice encoding: sorted, joined with `,`. */
export function encodeToolNameChoice(toolNames: ReadonlyArray<string>): string {
  return [...toolNames].sort().join(",");
}

/** The stub makes no decision, so it records one as `skippedUnsupported` with no suggestion. */
export function createStubDecisionRecord(
  decisionKind: DecisionKind,
  appliedChoice: string | null,
): DecisionRecord {
  return {
    decisionKind,
    decisionMode: "shadow",
    decisionStatus: "skippedUnsupported",
    suggestedChoice: null,
    appliedChoice,
    probability: null,
    decisionModelVersion: null,
    latencyInMilliseconds: null,
    decisionCostInUsd: null,
  };
}

export function createStubKrino(
  krinoConfig: KrinoConfig,
  stubOptions: StubRuntimeOptions = {},
): StubKrinoRuntime {
  const currentTime = stubOptions.currentTime ?? (() => new Date());
  const startedRuns: Array<StartedStubRun> = [];
  const toolSelectionRequests: Array<StepContext> = [];
  const riskGateRequests: Array<PendingToolCall> = [];
  const writtenTraces: Array<AgentStepTrace | RunSummaryTrace> = [];
  const flushTimeouts: Array<number> = [];

  const startRun = (runStart: RunStartOptions): RunHandle => {
    const runIdentifier = `stub-run-${startedRuns.length + 1}`;
    startedRuns.push({ ...runStart, runIdentifier });
    let runFinished = false;

    const decideToolSelection = async (stepContext: StepContext): Promise<ToolSelectionOutcome> => {
      toolSelectionRequests.push(stepContext);
      const toolNamesToSend = stepContext.availableTools.map(
        (toolDescription) => toolDescription.toolName,
      );
      return {
        toolNamesToSend,
        decisionRecord: createStubDecisionRecord(
          "toolSelection",
          encodeToolNameChoice(toolNamesToSend),
        ),
      };
    };

    const checkToolCallRisk = async (
      pendingToolCall: PendingToolCall,
    ): Promise<RiskGateOutcome> => {
      riskGateRequests.push(pendingToolCall);
      return {
        verdictToApply: null,
        // No answer means fail closed.
        suggestedVerdict: "askHuman",
        decisionRecord: createStubDecisionRecord("riskGate", null),
      };
    };

    const recordStep = (stepTrace: StepTraceInput): void => {
      if (runFinished) {
        return;
      }
      writtenTraces.push({
        ...stepTrace,
        traceSchemaVersion: TRACE_SCHEMA_VERSION,
        recordType: "agentStep",
        projectName: krinoConfig.projectName,
        recordedAt: currentTime().toISOString(),
      });
    };

    const finishRun = async (runSummary: RunSummaryInput): Promise<void> => {
      if (runFinished) {
        return;
      }
      runFinished = true;
      writtenTraces.push({
        ...runSummary,
        traceSchemaVersion: TRACE_SCHEMA_VERSION,
        recordType: "runSummary",
        projectName: krinoConfig.projectName,
        recordedAt: currentTime().toISOString(),
      });
    };

    return { runIdentifier, decideToolSelection, checkToolCallRisk, recordStep, finishRun };
  };

  const flushAll = async (timeoutInMilliseconds: number): Promise<void> => {
    flushTimeouts.push(timeoutInMilliseconds);
  };

  return {
    startRun,
    flushAll,
    startedRuns,
    toolSelectionRequests,
    riskGateRequests,
    writtenTraces,
    flushTimeouts,
  };
}
