import {
  createKrino,
  type DecisionProvider,
  type DecisionRecord,
  type ModelPrice,
  type StepContext,
  type ToolDescription,
  type TraceSink,
} from "@krinolabs/krino";
import { AI_SDK_HOST_CAPABILITIES } from "@krinolabs/krino/ai-sdk";
import type { ModelMessage } from "ai";

// BENCH ONLY. The per-step setup prunes the tool list before every step, to show the prompt-cache
// trap that krino avoids by choosing tools on step 0 only (ADR-006). krino's core never changes
// the list after step 0, so each step asks a fresh one-step run in enforce mode. Never export
// this from @krinolabs/krino. In --fake mode the provider behind it is the fake per-step router
// (agent-environment.ts), which is designed to vary the tool list: its numbers are not evidence.

/** The router's own runs are not agent runs; they are kept out of the traces. */
const DISCARDING_TRACE_SINK: TraceSink = {
  writeRecord: () => {},
  flush: async () => {},
};

export type PerStepRouterOptions = {
  projectName: string;
  hostSdkVersion: string;
  /** Every tool the agent has; each step chooses from all of them. */
  toolDescriptions: ReadonlyArray<ToolDescription>;
  taskText: string;
  decisionProviderFor: (calledToolNames: ReadonlyArray<string>) => DecisionProvider;
  /** Each step's wait before the selection fails open (all tools). */
  decisionTimeoutInMilliseconds: number;
  priceOverrides: Array<ModelPrice>;
};

export type RouterStepInput = {
  stepNumber: number;
  steps: ReadonlyArray<{ toolCalls: ReadonlyArray<{ toolName: string }> }>;
  messages: ReadonlyArray<ModelMessage>;
};

export type PerStepRouter = {
  /** For `generateText`'s `prepareStep`: the tools for this step. */
  prepareStep: (stepInput: RouterStepInput) => Promise<{ activeTools: Array<string> }>;
  /** One tool-selection decision per step, in step order. */
  toolSelectionDecisions: Array<DecisionRecord>;
};

function messageText(message: ModelMessage): string {
  if (typeof message.content === "string") {
    return message.content;
  }
  return message.content
    .flatMap((contentPart) => (contentPart.type === "text" ? [contentPart.text] : []))
    .join("\n");
}

/** `role: text` lines, as the AI SDK adapter sends them. */
function recentMessagesText(messages: ReadonlyArray<ModelMessage>): string {
  return messages
    .map((message) => ({ role: message.role, text: messageText(message) }))
    .filter((messageLine) => messageLine.text.length > 0)
    .map((messageLine) => `${messageLine.role}: ${messageLine.text}`)
    .join("\n");
}

export function createPerStepRouter(routerOptions: PerStepRouterOptions): PerStepRouter {
  const toolSelectionDecisions: Array<DecisionRecord> = [];

  const prepareStep: PerStepRouter["prepareStep"] = async (stepInput) => {
    const calledToolNames = stepInput.steps.flatMap((finishedStep) =>
      finishedStep.toolCalls.map((toolCall) => toolCall.toolName),
    );
    const routerRuntime = createKrino({
      projectName: `${routerOptions.projectName}-router`,
      decisionModes: { toolSelection: "enforce", riskGate: "off" },
      explorationRate: 0,
      decisionTimeoutInMilliseconds: routerOptions.decisionTimeoutInMilliseconds,
      decisionProvider: routerOptions.decisionProviderFor(calledToolNames),
      traceSink: DISCARDING_TRACE_SINK,
      priceOverrides: routerOptions.priceOverrides,
    });
    const runHandle = routerRuntime.startRun({
      hostName: "ai-sdk",
      hostSdkVersion: routerOptions.hostSdkVersion,
      capabilities: AI_SDK_HOST_CAPABILITIES,
    });
    const stepContext: StepContext = {
      runIdentifier: runHandle.runIdentifier,
      // The core lets enforce mode choose only on step 0, so every router run is a step 0.
      stepNumber: 0,
      taskText: routerOptions.taskText,
      availableTools: [...routerOptions.toolDescriptions],
      recentMessagesText: recentMessagesText(stepInput.messages),
    };
    try {
      const selectionOutcome = await runHandle.decideToolSelection(stepContext);
      toolSelectionDecisions.push(selectionOutcome.decisionRecord);
      // The router's one step, so the runtime can attach the decision (to the discarding sink).
      runHandle.recordStep({
        runIdentifier: runHandle.runIdentifier,
        stepNumber: 0,
        hostName: "ai-sdk",
        hostSdkVersion: routerOptions.hostSdkVersion,
        modelIdentifier: "router",
        availableToolNames: [...selectionOutcome.toolNamesToSend],
        chosenToolNames: [],
        tokenUsage: null,
        costInUsd: null,
        latencyInMilliseconds: null,
        decisions: [selectionOutcome.decisionRecord],
        contentHash: null,
      });
      return { activeTools: selectionOutcome.toolNamesToSend };
    } finally {
      await runHandle.finishRun({
        runIdentifier: runHandle.runIdentifier,
        hostName: "ai-sdk",
        hostSdkVersion: routerOptions.hostSdkVersion,
        modelIdentifier: "router",
        totalTokenUsage: {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        totalCostInUsd: 0,
        stepCount: 0,
        usedToolNames: [],
        toolSelectionAgreement: null,
      });
    }
  };

  return { prepareStep, toolSelectionDecisions };
}
