import type { generateText, streamText, TelemetryOptions, ToolSet } from "ai";
import type { KrinoRuntime } from "../../contracts/index.js";
import {
  type CallStartEvent,
  type CallStepEndEvent,
  createCallRunRegistry,
  type PrepareStepInput,
  type ToolExecutionStartEvent,
} from "./call-runs.js";
import { readAiSdkVersion } from "./host-sdk-version.js";
import { wrapToolsForRiskGate } from "./wrap-tools.js";

/** Options for `generateText`, typed for the caller's tool set. */
export type GenerateTextOptions<CallTools extends ToolSet> = Parameters<
  typeof generateText<CallTools>
>[0];

/** Options for `streamText`, typed for the caller's tool set. */
export type StreamTextOptions<CallTools extends ToolSet> = Parameters<
  typeof streamText<CallTools>
>[0];

type Callback<CallbackEvent> = (callbackEvent: CallbackEvent) => PromiseLike<void> | void;

type PrepareStepOverrides = { readonly activeTools?: ReadonlyArray<string> | undefined };

type PrepareStepCallback = (
  prepareStepInput: PrepareStepInput,
) => PromiseLike<PrepareStepOverrides | undefined> | PrepareStepOverrides | undefined;

/** The options `withKrino` reads or composes. Everything else passes through unchanged. */
type ComposableCallOptions = {
  tools?: ToolSet | undefined;
  activeTools?: ReadonlyArray<string> | undefined;
  prepareStep?: PrepareStepCallback | undefined;
  onStart?: Callback<CallStartEvent> | undefined;
  experimental_onStart?: Callback<CallStartEvent> | undefined;
  onStepEnd?: Callback<CallStepEndEvent> | undefined;
  onStepFinish?: Callback<CallStepEndEvent> | undefined;
  onEnd?: Callback<{ readonly callId: string }> | undefined;
  onFinish?: Callback<{ readonly callId: string }> | undefined;
  onToolExecutionStart?: Callback<ToolExecutionStartEvent> | undefined;
  experimental_onToolCallStart?: Callback<ToolExecutionStartEvent> | undefined;
  telemetry?: TelemetryOptions | undefined;
  experimental_telemetry?: TelemetryOptions | undefined;
  abortSignal?: AbortSignal | undefined;
};

const AI_SDK_VERSION = readAiSdkVersion();

/** Runs krino's handler (which never throws), then the caller's callback, and returns its result. */
function composeCallback<CallbackEvent>(
  krinoHandler: (callbackEvent: CallbackEvent) => void,
  callerCallback: Callback<CallbackEvent> | undefined,
): Callback<CallbackEvent> {
  return (callbackEvent) => {
    krinoHandler(callbackEvent);
    return callerCallback?.(callbackEvent);
  };
}

/** Merges the caller's prepareStep result with krino's tool list. Every caller field is kept. */
function mergePrepareStepResult(
  callerResult: PrepareStepOverrides | undefined,
  krinoActiveTools: Array<string> | undefined,
): PrepareStepOverrides | undefined {
  if (krinoActiveTools === undefined) {
    return callerResult;
  }
  return { ...callerResult, activeTools: krinoActiveTools };
}

/** Own tool entries by name. A `Map`, so names like `__proto__` and `constructor` are plain keys. */
function toolMapFrom(tools: ToolSet | undefined): Map<string, ToolSet[string]> {
  return new Map(tools === undefined ? [] : Object.entries(tools));
}

/**
 * Returns `generateText` / `streamText` options that run krino's decisions:
 * - Step 0 asks for a tool selection. In enforce mode the selected tools are sent on every step;
 *   the list never changes after step 0, so the prompt cache holds. Shadow mode sends all tools.
 * - Each tool call is checked by the risk gate (shadow in v0.1: recorded, then run as before).
 * - Each step's usage is recorded, with cache reads and writes kept apart from input tokens.
 * - The run summary is written on success, error and abort.
 *
 * Call it once per `generateText` / `streamText` call. The caller's `prepareStep` and callbacks
 * keep running; krino merges its tool list into the caller's `prepareStep` result.
 */
export function withKrino<
  CallTools extends ToolSet,
  CallOptions extends StreamTextOptions<CallTools>,
>(
  callOptions: CallOptions & StreamTextOptions<CallTools> & { tools?: CallTools },
  krinoRuntime: KrinoRuntime,
): CallOptions;
export function withKrino<
  CallTools extends ToolSet,
  CallOptions extends GenerateTextOptions<CallTools>,
>(
  callOptions: CallOptions & GenerateTextOptions<CallTools> & { tools?: CallTools },
  krinoRuntime: KrinoRuntime,
): CallOptions;
export function withKrino(
  callOptions: ComposableCallOptions,
  krinoRuntime: KrinoRuntime,
): ComposableCallOptions {
  const toolsByName = toolMapFrom(callOptions.tools);
  const registry = createCallRunRegistry({
    krinoRuntime,
    hostSdkVersion: AI_SDK_VERSION,
    toolsByName,
    defaultToolNames: callOptions.activeTools ?? [...toolsByName.keys()],
  });
  const callerPrepareStep = callOptions.prepareStep;

  const prepareStep: PrepareStepCallback = async (prepareStepInput) => {
    // The caller's prepareStep runs first. If it throws, the call fails as it would without krino.
    const callerResult =
      callerPrepareStep === undefined ? undefined : await callerPrepareStep(prepareStepInput);
    const krinoActiveTools = await registry.prepareStep(
      prepareStepInput,
      callerResult?.activeTools,
    );
    return mergePrepareStepResult(callerResult, krinoActiveTools);
  };

  const toolOverrides: Pick<ComposableCallOptions, "tools"> =
    callOptions.tools === undefined
      ? {}
      : { tools: wrapToolsForRiskGate(toolsByName, registry.checkToolCall) };

  return {
    ...callOptions,
    ...toolOverrides,
    prepareStep,
    onStart: composeCallback(
      registry.startCall,
      callOptions.onStart ?? callOptions.experimental_onStart,
    ),
    onStepEnd: composeCallback(
      registry.recordStep,
      callOptions.onStepEnd ?? callOptions.onStepFinish,
    ),
    onEnd: composeCallback(
      (endEvent) => registry.finishCall(endEvent.callId),
      callOptions.onEnd ?? callOptions.onFinish,
    ),
    onToolExecutionStart: composeCallback(
      registry.noteToolExecution,
      callOptions.onToolExecutionStart ?? callOptions.experimental_onToolCallStart,
    ),
  };
}
