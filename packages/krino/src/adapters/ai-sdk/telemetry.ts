import type { Telemetry, TelemetryOptions } from "ai";

// generateText has no onError or onAbort option. In ai 7.0.126 the only hook that sees a failed
// call is a telemetry integration: `catch (error) { await telemetryDispatcher.onError?.({ callId,
// error }); throw ... }`. krino adds one integration to this call's options, and nothing else:
// - it never writes the global list (globalThis.AI_SDK_TELEMETRY_INTEGRATIONS);
// - per-call integrations replace the global ones in the AI SDK, so krino copies the global ones
//   into the per-call list when the caller has none, and keeps the caller's list otherwise;
// - it never sets isEnabled, recordInputs, recordOutputs or functionId;
// - `isEnabled: false` is respected: krino then cannot see a thrown error.

export type CallEndListener = (callId: string) => void;

function callIdOf(telemetryEvent: unknown): string | null {
  if (
    typeof telemetryEvent !== "object" ||
    telemetryEvent === null ||
    !("callId" in telemetryEvent)
  ) {
    return null;
  }
  const { callId } = telemetryEvent;
  return typeof callId === "string" ? callId : null;
}

/** An integration that only listens for the end of a failed or aborted call. */
export function createKrinoTelemetryIntegration(onCallEnded: CallEndListener): Telemetry {
  const handleEndEvent = (telemetryEvent: unknown): void => {
    const callId = callIdOf(telemetryEvent);
    if (callId !== null) {
      onCallEnded(callId);
    }
  };
  return { onError: handleEndEvent, onAbort: handleEndEvent };
}

function globalTelemetryIntegrations(): Array<Telemetry> {
  const globalIntegrations = globalThis.AI_SDK_TELEMETRY_INTEGRATIONS;
  return Array.isArray(globalIntegrations) ? [...globalIntegrations] : [];
}

/** The caller's telemetry options with krino's integration added for this call only. */
export function telemetryWithKrino(
  callerTelemetry: TelemetryOptions | undefined,
  krinoIntegration: Telemetry,
): TelemetryOptions | undefined {
  if (callerTelemetry?.isEnabled === false) {
    return callerTelemetry;
  }
  const callerIntegrations = callerTelemetry?.integrations;
  const existingIntegrations =
    callerIntegrations === undefined
      ? globalTelemetryIntegrations()
      : Array.isArray(callerIntegrations)
        ? [...callerIntegrations]
        : [callerIntegrations];
  return { ...callerTelemetry, integrations: [...existingIntegrations, krinoIntegration] };
}
