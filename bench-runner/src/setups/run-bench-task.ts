import { estimateCatalogSize, toToolDescriptions } from "@krinolabs/bench";
import { createAiSdkToolSet } from "@krinolabs/bench/ai-sdk";
import {
  buildRiskGatePolicy,
  FLUSH_TIMEOUT_IN_MILLISECONDS,
  MAX_STEP_COUNT,
  SYSTEM_PROMPT,
  selectLogTriageTools,
} from "@krinolabs/example-ai-sdk-cli/agent";
import {
  type AgentStepTrace,
  createFileTraceSink,
  createKrino,
  type DecisionMode,
  type DecisionRecord,
  type RunSummaryTrace,
  type TokenUsageRecord,
  type TraceSink,
} from "@krinolabs/krino";
import { withKrino } from "@krinolabs/krino/ai-sdk";
import { generateText, stepCountIs } from "ai";
import type { AgentEnvironment } from "../environment/agent-environment.js";
import { readInstalledVersion } from "../environment/installed-versions.js";
import type { BenchSetupName, PlannedRun } from "../plan/run-plan.js";
import type { ObservedStep } from "../scoring/scoring.js";
import { createPerStepRouter, type PerStepRouter } from "./per-step-router.js";

// One planned run: the log-triage agent (examples/ai-sdk-cli) on one bench task, on the AI SDK
// host, with the setup's routing. Traces go to the file sink under the setup's project name; a
// tee keeps this run's records in memory so the bench scores exactly what was traced.

export const BENCH_PROJECT_NAME = "krino-bench";

/** One project per setup and tool count, so the report engine can read each on its own. */
export function projectNameFor(setupName: BenchSetupName, toolCount: number): string {
  return `${BENCH_PROJECT_NAME}-${setupName}-${toolCount}-tools`;
}

const TOOL_SELECTION_MODE_BY_SETUP: ReadonlyMap<BenchSetupName, DecisionMode> = new Map<
  BenchSetupName,
  DecisionMode
>([
  ["baseline", "off"],
  // per-step routes in its own prepareStep (bench only); krino's own selection stays off.
  ["per-step", "off"],
  ["step-zero", "enforce"],
]);

const AI_SDK_VERSION = readInstalledVersion("ai");
const FAILURE_TEXT_LIMIT = 300;

export type ObservedAgentStep = ObservedStep & {
  stepNumber: number;
  modelIdentifier: string;
  tokenUsage: TokenUsageRecord | null;
  costInUsd: number | null;
  latencyInMilliseconds: number | null;
};

export type RunObservation = {
  runIndex: number;
  setupName: BenchSetupName;
  toolCount: number;
  taskIdentifier: string;
  difficulty: PlannedRun["task"]["difficulty"];
  repeatIndex: number;
  projectName: string;
  runStatus: "completed" | "failed";
  /** Error name and message, trimmed; never request bodies or keys. */
  failureText: string | null;
  expectedToolNames: Array<string>;
  availableToolCount: number;
  /** Estimated tokens of the tool definitions the run had available (characters ÷ 4). */
  catalogTokenCount: number;
  steps: Array<ObservedAgentStep>;
  /** Every call, in order, repeats included. */
  calledToolNames: Array<string>;
  /** Asked tool selections: step-zero's one, per-step's one per step. */
  toolSelectionDecisions: Array<DecisionRecord>;
  riskGateDecisions: Array<DecisionRecord>;
  agentModelIdentifiers: Array<string>;
  agentCostInUsd: number;
  /** Estimated by the runtime. */
  decisionCostInUsd: number;
  spentInUsd: number;
};

export type RunBenchTaskInputs = {
  plannedRun: PlannedRun;
  traceDirectory: string;
  agentEnvironment: AgentEnvironment;
};

function teeTraceSink(
  fileSink: TraceSink,
  collectedRecords: Array<AgentStepTrace | RunSummaryTrace>,
): TraceSink {
  return {
    writeRecord: (traceRecord) => {
      collectedRecords.push(traceRecord);
      fileSink.writeRecord(traceRecord);
    },
    flush: (timeoutInMilliseconds) => fileSink.flush(timeoutInMilliseconds),
  };
}

function describeFailure(runError: unknown): string {
  const failureText =
    runError instanceof Error ? `${runError.name}: ${runError.message}` : "unknown error";
  return failureText.length > FAILURE_TEXT_LIMIT
    ? `${failureText.slice(0, FAILURE_TEXT_LIMIT)}…`
    : failureText;
}

function sumOf(values: ReadonlyArray<number | null>): number {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

function observeSteps(collectedRecords: ReadonlyArray<AgentStepTrace | RunSummaryTrace>) {
  return collectedRecords
    .flatMap((traceRecord) => (traceRecord.recordType === "agentStep" ? [traceRecord] : []))
    .sort((leftStep, rightStep) => leftStep.stepNumber - rightStep.stepNumber);
}

export async function runBenchTask(runInputs: RunBenchTaskInputs): Promise<RunObservation> {
  const { plannedRun, agentEnvironment } = runInputs;
  const { task, setupName, toolCount } = plannedRun;
  const projectName = projectNameFor(setupName, toolCount);
  const toolDefinitions = selectLogTriageTools(toolCount, task.expectedToolNames);
  const toolNames = toolDefinitions.map((toolDefinition) => toolDefinition.toolName);

  const collectedRecords: Array<AgentStepTrace | RunSummaryTrace> = [];
  const krino = createKrino({
    projectName,
    decisionModes: {
      toolSelection: TOOL_SELECTION_MODE_BY_SETUP.get(setupName) ?? "off",
      riskGate: "shadow",
    },
    explorationRate: 0,
    riskGatePolicy: buildRiskGatePolicy(toolNames),
    decisionProvider: agentEnvironment.createDecisionProvider(task),
    traceSink: teeTraceSink(
      createFileTraceSink({ projectName, traceDirectory: runInputs.traceDirectory }),
      collectedRecords,
    ),
    priceOverrides: agentEnvironment.priceOverrides,
  });
  const perStepRouter: PerStepRouter | null =
    setupName === "per-step"
      ? createPerStepRouter({
          projectName,
          hostSdkVersion: AI_SDK_VERSION,
          toolDescriptions: toToolDescriptions(toolDefinitions),
          taskText: task.taskText,
          decisionProviderFor: (calledToolNames) =>
            agentEnvironment.createStepDecisionProvider(task, calledToolNames),
          priceOverrides: agentEnvironment.priceOverrides,
        })
      : null;

  let failureText: string | null = null;
  try {
    await generateText(
      withKrino(
        {
          model: agentEnvironment.createModel(task),
          system: SYSTEM_PROMPT,
          prompt: task.taskText,
          tools: createAiSdkToolSet(toolDefinitions),
          stopWhen: stepCountIs(MAX_STEP_COUNT),
          ...(perStepRouter === null ? {} : { prepareStep: perStepRouter.prepareStep }),
        },
        krino,
      ),
    );
  } catch (runError) {
    // Record and continue: one failed run must not stop the bench.
    failureText = describeFailure(runError);
  }
  await krino.flushAll(FLUSH_TIMEOUT_IN_MILLISECONDS);

  const stepTraces = observeSteps(collectedRecords);
  const tracedDecisions = stepTraces.flatMap((stepTrace) => stepTrace.decisions);
  const toolSelectionDecisions =
    perStepRouter === null
      ? tracedDecisions.filter(
          (decisionRecord) =>
            decisionRecord.decisionKind === "toolSelection" &&
            decisionRecord.decisionMode !== "off",
        )
      : [...perStepRouter.toolSelectionDecisions];
  const riskGateDecisions = tracedDecisions.filter(
    (decisionRecord) => decisionRecord.decisionKind === "riskGate",
  );
  const steps: Array<ObservedAgentStep> = stepTraces.map((stepTrace) => ({
    stepNumber: stepTrace.stepNumber,
    offeredToolNames: [...stepTrace.availableToolNames],
    calledToolNames: [...stepTrace.chosenToolNames],
    modelIdentifier: stepTrace.modelIdentifier,
    tokenUsage: stepTrace.tokenUsage,
    costInUsd: stepTrace.costInUsd,
    latencyInMilliseconds: stepTrace.latencyInMilliseconds,
  }));
  const agentCostInUsd = sumOf(steps.map((observedStep) => observedStep.costInUsd));
  const decisionCostInUsd = sumOf(
    [...toolSelectionDecisions, ...riskGateDecisions].map(
      (decisionRecord) => decisionRecord.decisionCostInUsd,
    ),
  );
  return {
    runIndex: plannedRun.runIndex,
    setupName,
    toolCount,
    taskIdentifier: task.taskIdentifier,
    difficulty: task.difficulty,
    repeatIndex: plannedRun.repeatIndex,
    projectName,
    runStatus: failureText === null ? "completed" : "failed",
    failureText,
    expectedToolNames: [...task.expectedToolNames],
    availableToolCount: toolNames.length,
    catalogTokenCount: estimateCatalogSize(toolDefinitions).estimatedTokenCount,
    steps,
    calledToolNames: steps.flatMap((observedStep) => observedStep.calledToolNames),
    toolSelectionDecisions,
    riskGateDecisions,
    agentModelIdentifiers: [...new Set(steps.map((observedStep) => observedStep.modelIdentifier))],
    agentCostInUsd,
    decisionCostInUsd,
    spentInUsd: agentCostInUsd + decisionCostInUsd,
  };
}
