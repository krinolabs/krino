import type { Options as AgentQueryOptions } from "@anthropic-ai/claude-agent-sdk";
import {
  type AgentStepTrace,
  type CreateKrino,
  costFromUsage,
  createFakeDecisionProvider,
  createFileTraceSink,
  createKrino,
  DEFAULT_CACHE_READ_MULTIPLIER,
  DEFAULT_CACHE_WRITE_MULTIPLIER,
  DEFAULT_CONTEXT_SAFETY_MARGIN_RATIO,
  DEFAULT_DECISION_CONTEXT_BUDGET_IN_TOKENS,
  DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS,
  DEFAULT_MODEL_PRICES,
  type DecisionAnswer,
  type DecisionKind,
  type DecisionMode,
  type DecisionProvider,
  DecisionProviderError,
  type DecisionQuestion,
  type DecisionRecord,
  type DecisionRequestOptions,
  type DecisionStatus,
  DecisionTimeoutError,
  encodeToolNameChoice,
  FAKE_DECISION_MODEL_VERSION,
  FAKE_PROVIDER_NAME,
  type FailureRule,
  type FakeAnswer,
  type FakeAnswerFunction,
  type FakeCallOutcome,
  type FakeDecisionProvider,
  type FakeDecisionProviderOptions,
  type FakeErrorInjection,
  type FakeProviderCall,
  type FileTraceSink,
  type FileTraceSinkOptions,
  findModelPrice,
  type HostCapabilities,
  type HostName,
  KRINO_CONFIG_DEFAULTS,
  type KrinoConfig,
  type KrinoConfigDefaults,
  KrinoConfigurationError,
  type KrinoRuntime,
  type ModelCandidate,
  type ModelPrice,
  type ModelRouteContext,
  type ModelRouteOutcome,
  type ModelRoutingPolicy,
  type PendingToolCall,
  type RiskCosts,
  type RiskGateOutcome,
  type RiskGatePolicy,
  type RiskGateVerdict,
  type RunHandle,
  type RunOutcome,
  type RunStartOptions,
  type RunSummaryInput,
  type RunSummaryTrace,
  resolveTraceDirectory,
  type StepContext,
  type StepTraceInput,
  SUPPORTED_TRACE_SCHEMA_VERSIONS,
  type TokenUsageRecord,
  type ToolDescription,
  type ToolSelectionOutcome,
  type ToolSelectionTiming,
  TRACE_SCHEMA_VERSION,
  type TraceSchemaVersion,
  type TraceSink,
  thresholdFromCosts,
  type UnscriptedQuestionRule,
} from "@krinolabs/krino";
import {
  AI_SDK_HOST_CAPABILITIES,
  type GenerateTextOptions,
  type StreamTextOptions,
  withKrino,
} from "@krinolabs/krino/ai-sdk";
import {
  buildDisallowedTools,
  CLAUDE_AGENT_SDK_CAPABILITIES,
  CLAUDE_AGENT_SDK_HOST_NAME,
  type DisallowedToolsInput,
  type KrinoAgentAdapterOptions,
  type KrinoAgentRun,
  krinoAgentOptions,
  type ObserveKrinoMessagesOptions,
  observeKrinoMessages,
} from "@krinolabs/krino/claude-agent-sdk";
import {
  AI_GATEWAY_API_KEY_VARIABLE,
  buildJevEvaluationRequest,
  createJevAiGatewayProvider,
  JEV_MODEL_IDENTIFIER,
  type JevAiGatewayProviderOptions,
  type JevEvaluationReport,
  type JevEvaluationRequest,
  type JevEvaluationState,
  sanitizeJevResponseBody,
  yesNoFromProbabilityOfTrue,
} from "@krinolabs/krino/providers/jev";
import type { LanguageModel, ToolSet } from "ai";

// Type-checked, never run: uses every public export of every @krinolabs/krino entry point, as a
// consumer with a strict tsconfig would. The e2e test fails when an export is missing here.

// --- Root entry: contracts ---------------------------------------------------------------

const decisionKind: DecisionKind = "toolSelection";
const decisionMode: DecisionMode = "shadow";
const failureRule: FailureRule = "failOpen";
const decisionStatus: DecisionStatus = "answered";
const hostName: HostName = "ai-sdk";
const toolSelectionTiming: ToolSelectionTiming = "perStep";
const riskGateVerdict: RiskGateVerdict = "askHuman";
const unscriptedQuestionRule: UnscriptedQuestionRule = "answerConservatively";
const fakeCallOutcome: FakeCallOutcome = "answered";

const toolDescription: ToolDescription = { toolName: "searchLogs", toolDescription: "Searches." };
const capabilities: HostCapabilities = {
  supportedDecisions: [decisionKind, "riskGate"],
  toolSelectionTiming,
  reportsPerStepUsage: true,
};
const stepContext: StepContext = {
  runIdentifier: "run-1",
  stepNumber: 0,
  taskText: "Find the error.",
  availableTools: [toolDescription],
  recentMessagesText: "",
};
const pendingToolCall: PendingToolCall = {
  runIdentifier: "run-1",
  stepNumber: 1,
  toolName: "searchLogs",
  toolArguments: { service: "checkout" },
};
const decisionQuestion: DecisionQuestion = {
  decisionKind,
  questionText: 'Does the agent need the tool "searchLogs"?',
  options: null,
};
const modelCandidates: Array<ModelCandidate> = [
  { modelIdentifier: "claude-sonnet-5-5", useWhen: "Hard debugging or design work." },
  { modelIdentifier: "claude-haiku-4-5", useWhen: "Questions and small edits." },
];
const modelRoutingPolicy: ModelRoutingPolicy = {
  candidateModels: modelCandidates,
  fallbackModelIdentifier: "claude-sonnet-5-5",
};
const modelRouteContext: ModelRouteContext = {
  stepContext,
  hostModelIdentifier: modelRoutingPolicy.fallbackModelIdentifier,
  availableCandidateIdentifiers: modelCandidates.map((candidate) => candidate.modelIdentifier),
  canApplyRoute: true,
};
const runOutcome: RunOutcome = "completed";
const supportedTraceSchemaVersions: ReadonlyArray<TraceSchemaVersion> =
  SUPPORTED_TRACE_SCHEMA_VERSIONS;
const decisionAnswer: DecisionAnswer = {
  choice: "yes",
  probability: 0.9,
  decisionModelVersion: FAKE_DECISION_MODEL_VERSION,
  latencyInMilliseconds: 3,
};
const requestOptions: DecisionRequestOptions = {
  timeoutInMilliseconds: KRINO_CONFIG_DEFAULTS.decisionTimeoutInMilliseconds,
  abortSignal: new AbortController().signal,
};
const tokenUsage: TokenUsageRecord = {
  inputTokens: 100,
  outputTokens: 10,
  cacheReadTokens: 900,
  cacheWriteTokens: 0,
};
const decisionRecord: DecisionRecord = {
  decisionKind,
  decisionMode,
  decisionStatus,
  suggestedChoice: encodeToolNameChoice(["searchLogs"]),
  appliedChoice: null,
  probability: decisionAnswer.probability,
  decisionModelVersion: decisionAnswer.decisionModelVersion,
  latencyInMilliseconds: decisionAnswer.latencyInMilliseconds,
  decisionCostInUsd: null,
};
const stepTraceInput: StepTraceInput = {
  runIdentifier: "run-1",
  stepNumber: 0,
  hostName,
  hostSdkVersion: "7.0.126",
  modelIdentifier: "claude-haiku-4-5",
  availableToolNames: ["searchLogs"],
  chosenToolNames: [],
  tokenUsage,
  costInUsd: null,
  latencyInMilliseconds: null,
  decisions: [decisionRecord],
  contentHash: null,
};
const agentStepTrace: AgentStepTrace = {
  ...stepTraceInput,
  traceSchemaVersion: TRACE_SCHEMA_VERSION,
  recordType: "agentStep",
  projectName: "e2e",
  recordedAt: new Date(0).toISOString(),
};
const runSummaryInput: RunSummaryInput = {
  runIdentifier: "run-1",
  hostName,
  hostSdkVersion: "7.0.126",
  modelIdentifier: "claude-haiku-4-5",
  totalTokenUsage: tokenUsage,
  totalCostInUsd: 0,
  stepCount: 1,
  usedToolNames: [],
  toolSelectionAgreement: null,
  runOutcome,
};
const runSummaryTrace: RunSummaryTrace = {
  ...runSummaryInput,
  routingCounterfactualCostInUsd: null,
  runOutcome,
  traceSchemaVersion: TRACE_SCHEMA_VERSION,
  recordType: "runSummary",
  projectName: "e2e",
  recordedAt: new Date(0).toISOString(),
};

// --- Root entry: pricing, risk, sinks, providers, runtime --------------------------------

const modelPrice: ModelPrice | null = findModelPrice("claude-haiku-4-5", DEFAULT_MODEL_PRICES);
const customPrice: ModelPrice = {
  modelIdentifier: "my-model",
  inputPricePerMillionTokens: 1,
  outputPricePerMillionTokens: 5,
  cacheWriteMultiplier: DEFAULT_CACHE_WRITE_MULTIPLIER,
  cacheReadMultiplier: DEFAULT_CACHE_READ_MULTIPLIER,
  verifiedOn: "2026-10-03",
};
const stepCostInUsd: number = costFromUsage(tokenUsage, modelPrice ?? customPrice);

const riskCosts: RiskCosts = { costOfAskingInUsd: 0.5, costOfBadCallInUsd: 50 };
const riskGatePolicy: RiskGatePolicy = {
  blockedToolNames: ["deleteDatabase"],
  alwaysAllowedToolNames: ["searchLogs"],
  allowThresholdByToolName: { restartService: thresholdFromCosts(riskCosts) },
};

const fileTraceSinkOptions: FileTraceSinkOptions = {
  projectName: "e2e",
  traceDirectory: resolveTraceDirectory("e2e"),
};
const fileTraceSink: FileTraceSink = createFileTraceSink(fileTraceSinkOptions);
const traceSink: TraceSink = fileTraceSink;

const fakeAnswer: FakeAnswer = { choice: "yes", probability: 0.95 };
const answerQuestion: FakeAnswerFunction = (question) =>
  question.decisionKind === decisionQuestion.decisionKind ? fakeAnswer : null;
const injectError: FakeErrorInjection = (fakeProviderCall: FakeProviderCall) =>
  fakeProviderCall.callOutcome === fakeCallOutcome
    ? null
    : new DecisionProviderError("injected", { providerName: FAKE_PROVIDER_NAME });
const fakeOptions: FakeDecisionProviderOptions = {
  providerName: FAKE_PROVIDER_NAME,
  answerQuestion,
  unscriptedQuestionRule,
  injectError,
};
const fakeProvider: FakeDecisionProvider = createFakeDecisionProvider(fakeOptions);
const decisionProvider: DecisionProvider = fakeProvider;

const krinoConfig: KrinoConfig = {
  projectName: "e2e",
  decisionModes: { ...KRINO_CONFIG_DEFAULTS.decisionModes, riskGate: decisionMode },
  decisionProvider,
  traceSink,
  riskGatePolicy,
  priceOverrides: [customPrice],
};
const configDefaults: KrinoConfigDefaults = KRINO_CONFIG_DEFAULTS;
const create: CreateKrino = createKrino;
const krinoRuntime: KrinoRuntime = create(krinoConfig);
const runStartOptions: RunStartOptions = { hostName, hostSdkVersion: "7.0.126", capabilities };

export async function exerciseRuntime(): Promise<{
  toolSelection: ToolSelectionOutcome;
  modelRoute: ModelRouteOutcome;
  riskGate: RiskGateOutcome;
  verdict: RiskGateVerdict | null;
}> {
  const runHandle: RunHandle = krinoRuntime.startRun(runStartOptions);
  const toolSelection = await runHandle.decideToolSelection(stepContext);
  const modelRoute = await runHandle.decideModelRoute(modelRouteContext);
  const riskGate = await runHandle.checkToolCallRisk(pendingToolCall);
  runHandle.recordStep(stepTraceInput);
  await runHandle.finishRun(runSummaryInput);
  await krinoRuntime.flushAll(DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS);
  const answers = await decisionProvider.askDecisionQuestions(
    [decisionQuestion],
    stepContext,
    requestOptions,
  );
  return {
    toolSelection,
    modelRoute,
    riskGate,
    verdict: answers.length > 0 ? riskGate.verdictToApply : riskGateVerdict,
  };
}

export function describeError(caughtError: unknown): FailureRule | "configuration" | "unknown" {
  if (caughtError instanceof KrinoConfigurationError) {
    return "configuration";
  }
  if (caughtError instanceof DecisionTimeoutError || caughtError instanceof DecisionProviderError) {
    return failureRule;
  }
  return "unknown";
}

// --- @krinolabs/krino/ai-sdk -------------------------------------------------------------

export function aiSdkCallOptions(model: LanguageModel, tools: ToolSet) {
  const generateOptions: GenerateTextOptions<ToolSet> = withKrino(
    { model, prompt: stepContext.taskText, tools },
    krinoRuntime,
  );
  const streamOptions: StreamTextOptions<ToolSet> = withKrino(
    { model, prompt: stepContext.taskText, tools },
    krinoRuntime,
  );
  const aiSdkCapabilities: HostCapabilities = AI_SDK_HOST_CAPABILITIES;
  return { generateOptions, streamOptions, aiSdkCapabilities };
}

// --- @krinolabs/krino/claude-agent-sdk ---------------------------------------------------

export async function agentSdkRun(
  messageStream: Parameters<typeof observeKrinoMessages>[0],
): Promise<Array<string>> {
  const adapterOptions: KrinoAgentAdapterOptions = { toolDescriptions: [toolDescription] };
  const queryOptions: AgentQueryOptions = { model: "claude-haiku-4-5" };
  const krinoRun: KrinoAgentRun = await krinoAgentOptions(
    queryOptions,
    krinoRuntime,
    stepContext.taskText,
    adapterOptions,
  );
  const observeOptions: ObserveKrinoMessagesOptions = { waitForTracesOnEnd: true };
  const messageTypes: Array<string> = [];
  for await (const message of observeKrinoMessages(messageStream, krinoRun, observeOptions)) {
    messageTypes.push(message.type);
  }
  const disallowedToolsInput: DisallowedToolsInput = {
    userDisallowedTools: krinoRun.queryOptions.disallowedTools,
    knownToolNames: [toolDescription.toolName],
    suggestedToolNames: krinoRun.toolSelection.toolNamesToSend,
  };
  const agentHostName: HostName = CLAUDE_AGENT_SDK_HOST_NAME;
  const agentCapabilities: HostCapabilities = CLAUDE_AGENT_SDK_CAPABILITIES;
  return [
    ...messageTypes,
    ...buildDisallowedTools(disallowedToolsInput),
    agentHostName,
    agentCapabilities.toolSelectionTiming,
  ];
}

// --- @krinolabs/krino/providers/jev ------------------------------------------------------

export function jevProvider(): {
  provider: DecisionProvider;
  request: JevEvaluationRequest;
  yesNo: { choice: string; probability: number };
} {
  const reports: Array<JevEvaluationReport> = [];
  const jevOptions: JevAiGatewayProviderOptions = {
    modelIdentifier: JEV_MODEL_IDENTIFIER,
    environment: { [AI_GATEWAY_API_KEY_VARIABLE]: undefined },
    onEvaluationReport: (evaluationReport) => {
      reports.push(evaluationReport);
      sanitizeJevResponseBody(evaluationReport.responseBody);
    },
  };
  const request = buildJevEvaluationRequest([decisionQuestion], stepContext);
  const state: JevEvaluationState = request.state;
  return {
    provider: createJevAiGatewayProvider(jevOptions),
    request: { ...request, state },
    yesNo: yesNoFromProbabilityOfTrue(0.2),
  };
}

export const traces: {
  step: AgentStepTrace;
  summary: RunSummaryTrace;
  supportedVersions: ReadonlyArray<TraceSchemaVersion>;
} = {
  step: agentStepTrace,
  summary: runSummaryTrace,
  supportedVersions: supportedTraceSchemaVersions,
};
export const costs = {
  stepCostInUsd,
  contextBudget: DEFAULT_DECISION_CONTEXT_BUDGET_IN_TOKENS,
  safetyMargin: DEFAULT_CONTEXT_SAFETY_MARGIN_RATIO,
  configDefaults,
  fakeProvider,
};
