import { createAiSdkToolSet } from "@krinolabs/bench/ai-sdk";
import { createFileTraceSink, createKrino, type DecisionProvider } from "@krinolabs/krino";
import { withKrino } from "@krinolabs/krino/ai-sdk";
import { generateText, type LanguageModel, stepCountIs } from "ai";
import {
  createLogTriageKrinoConfig,
  FLUSH_TIMEOUT_IN_MILLISECONDS,
  LOG_TRIAGE_TASK_TEXT,
  MAX_STEP_COUNT,
  PROJECT_NAME,
  SYSTEM_PROMPT,
  selectLogTriageTools,
  type ToolCount,
} from "./log-triage.js";

export type LogTriageRunOptions = {
  model: LanguageModel;
  decisionProvider: DecisionProvider;
  traceDirectory: string;
  toolCount: ToolCount;
};

export type LogTriageResult = {
  answerText: string;
  stepCount: number;
  /** Tools the agent called, in first-call order. */
  usedToolNames: Array<string>;
};

/** Runs the agent once with krino in shadow mode, then waits until the traces are written. */
export async function runLogTriage(runOptions: LogTriageRunOptions): Promise<LogTriageResult> {
  const toolDefinitions = selectLogTriageTools(runOptions.toolCount);
  const krino = createKrino(
    createLogTriageKrinoConfig({
      toolNames: toolDefinitions.map((toolDefinition) => toolDefinition.toolName),
      decisionProvider: runOptions.decisionProvider,
      traceSink: createFileTraceSink({
        projectName: PROJECT_NAME,
        traceDirectory: runOptions.traceDirectory,
      }),
    }),
  );

  const result = await generateText(
    withKrino(
      {
        model: runOptions.model,
        system: SYSTEM_PROMPT,
        prompt: LOG_TRIAGE_TASK_TEXT,
        tools: createAiSdkToolSet(toolDefinitions),
        stopWhen: stepCountIs(MAX_STEP_COUNT),
      },
      krino,
    ),
  );
  // Shadow decisions answer in the background. Wait for them (bounded) so a CLI that exits
  // right after this keeps every trace line.
  await krino.flushAll(FLUSH_TIMEOUT_IN_MILLISECONDS);

  const calledToolNames = result.steps.flatMap((step) =>
    step.toolCalls.map((toolCall) => toolCall.toolName),
  );
  return {
    answerText: result.text,
    stepCount: result.steps.length,
    usedToolNames: [...new Set(calledToolNames)],
  };
}
