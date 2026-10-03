import {
  createFakeDecisionProvider,
  createKrino,
  DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS,
  type HostCapabilities,
  type ToolDescription,
} from "@krinolabs/krino";

// Uses only the root entry, in a project without `ai` or `@anthropic-ai/*`: one shadow-mode
// step with both decisions, written by the default file sink to $KRINO_TRACE_DIRECTORY.
// Shadow decisions finish in the background; the trace holds their final status.

const HOST_SDK_VERSION = "none";
const MODEL_IDENTIFIER = "claude-haiku-4-5";

const capabilities: HostCapabilities = {
  supportedDecisions: ["toolSelection", "riskGate"],
  toolSelectionTiming: "perStep",
  reportsPerStepUsage: true,
};
const availableTools: Array<ToolDescription> = [
  { toolName: "lookupOrder", toolDescription: "Looks up an order by its ID." },
  { toolName: "refundOrder", toolDescription: "Refunds an order." },
];
const availableToolNames = availableTools.map((availableTool) => availableTool.toolName);

const krino = createKrino({
  projectName: "e2e-root-only",
  decisionModes: { toolSelection: "shadow", riskGate: "shadow" },
  decisionProvider: createFakeDecisionProvider({
    answerQuestion: (decisionQuestion) =>
      decisionQuestion.decisionKind === "toolSelection"
        ? { choice: "yes", probability: 0.95 }
        : null,
  }),
  riskGatePolicy: {
    blockedToolNames: [],
    alwaysAllowedToolNames: ["lookupOrder"],
    allowThresholdByToolName: { refundOrder: 0.9 },
  },
});

const runHandle = krino.startRun({
  hostName: "ai-sdk",
  hostSdkVersion: HOST_SDK_VERSION,
  capabilities,
});
const toolSelection = await runHandle.decideToolSelection({
  runIdentifier: runHandle.runIdentifier,
  stepNumber: 0,
  taskText: "Refund order 42.",
  availableTools,
  recentMessagesText: "",
});
const riskGate = await runHandle.checkToolCallRisk({
  runIdentifier: runHandle.runIdentifier,
  stepNumber: 0,
  toolName: "refundOrder",
  toolArguments: { orderId: "42" },
});
const tokenUsage = { inputTokens: 200, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0 };
runHandle.recordStep({
  runIdentifier: runHandle.runIdentifier,
  stepNumber: 0,
  hostName: "ai-sdk",
  hostSdkVersion: HOST_SDK_VERSION,
  modelIdentifier: MODEL_IDENTIFIER,
  availableToolNames,
  chosenToolNames: ["refundOrder"],
  tokenUsage,
  costInUsd: null,
  latencyInMilliseconds: 5,
  decisions: [toolSelection.decisionRecord, riskGate.decisionRecord],
  contentHash: null,
});
await runHandle.finishRun({
  runIdentifier: runHandle.runIdentifier,
  hostName: "ai-sdk",
  hostSdkVersion: HOST_SDK_VERSION,
  modelIdentifier: MODEL_IDENTIFIER,
  totalTokenUsage: tokenUsage,
  totalCostInUsd: 0,
  stepCount: 1,
  usedToolNames: ["refundOrder"],
  toolSelectionAgreement: null,
});
await krino.flushAll(DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS);

console.log(
  JSON.stringify({
    toolNamesToSend: [...toolSelection.toolNamesToSend].sort(),
    riskVerdictToApply: riskGate.verdictToApply,
  }),
);
