import { createRequire } from "node:module";
import { type ModelMessage, type Telemetry, type ToolSet, tool } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { readAiSdkVersion } from "./host-sdk-version.js";
import {
  buildStepContext,
  describeTools,
  messageText,
  recentMessagesText,
  taskTextFromMessages,
} from "./step-context.js";
import { createKrinoTelemetryIntegration, telemetryWithKrino } from "./telemetry.js";

const MESSAGES: Array<ModelMessage> = [
  { role: "system", content: "You run the order desk." },
  { role: "user", content: "Where is order A-1?" },
  {
    role: "assistant",
    content: [
      { type: "text", text: "Let me check." },
      { type: "tool-call", toolCallId: "call-1", toolName: "getOrder", input: { id: "A-1" } },
    ],
  },
  {
    role: "tool",
    content: [
      {
        type: "tool-result",
        toolCallId: "call-1",
        toolName: "getOrder",
        output: { type: "json", value: { status: "shipped" } },
      },
    ],
  },
  { role: "user", content: [{ type: "text", text: "Cancel it." }] },
];

describe("step context", () => {
  it("reads text parts only", () => {
    expect(MESSAGES.map(messageText)).toEqual([
      "You run the order desk.",
      "Where is order A-1?",
      "Let me check.",
      "",
      "Cancel it.",
    ]);
  });

  it("uses the latest user message as the task", () => {
    expect(taskTextFromMessages(MESSAGES)).toBe("Cancel it.");
    expect(taskTextFromMessages([{ role: "system", content: "Only a system prompt." }])).toBe("");
  });

  it("writes recent messages as role lines and skips tool results", () => {
    expect(recentMessagesText(MESSAGES)).toBe(
      [
        "system: You run the order desk.",
        "user: Where is order A-1?",
        "assistant: Let me check.",
        "user: Cancel it.",
      ].join("\n"),
    );
  });

  it("describes tools by name; a description that is a function becomes empty", () => {
    const tools: ToolSet = {
      getOrder: tool({
        description: "Gets an order.",
        inputSchema: z.object({ id: z.string() }),
        execute: async () => ({}),
      }),
      contextual: tool({
        description: () => "Depends on context.",
        inputSchema: z.object({ id: z.string() }),
        execute: async () => ({}),
      }),
    };

    expect(describeTools(new Map(Object.entries(tools)), ["getOrder", "contextual"])).toEqual([
      { toolName: "getOrder", toolDescription: "Gets an order." },
      { toolName: "contextual", toolDescription: "" },
    ]);
  });

  it("builds a step context", () => {
    expect(
      buildStepContext({
        runIdentifier: "run-1",
        stepNumber: 0,
        messages: MESSAGES,
        availableTools: [{ toolName: "getOrder", toolDescription: "Gets an order." }],
      }),
    ).toMatchObject({ runIdentifier: "run-1", stepNumber: 0, taskText: "Cancel it." });
  });
});

describe("telemetry", () => {
  const originalGlobalIntegrations = globalThis.AI_SDK_TELEMETRY_INTEGRATIONS;

  afterEach(() => {
    globalThis.AI_SDK_TELEMETRY_INTEGRATIONS = originalGlobalIntegrations;
  });

  const krinoIntegration: Telemetry = { onError: () => {} };

  it("returns the caller's options untouched when telemetry is disabled", () => {
    const disabledTelemetry = { isEnabled: false };
    expect(telemetryWithKrino(disabledTelemetry, krinoIntegration)).toBe(disabledTelemetry);
  });

  it("copies the global integrations without changing them", () => {
    const globalIntegration: Telemetry = { onStart: () => {} };
    const globalIntegrations = [globalIntegration];
    globalThis.AI_SDK_TELEMETRY_INTEGRATIONS = globalIntegrations;

    const telemetry = telemetryWithKrino(undefined, krinoIntegration);

    expect(telemetry).toEqual({ integrations: [globalIntegration, krinoIntegration] });
    expect(globalIntegrations).toEqual([globalIntegration]);
  });

  it("works with no global integrations", () => {
    globalThis.AI_SDK_TELEMETRY_INTEGRATIONS = undefined;
    expect(telemetryWithKrino(undefined, krinoIntegration)).toEqual({
      integrations: [krinoIntegration],
    });
  });

  it("keeps a single caller integration and every other caller field", () => {
    const callerIntegration: Telemetry = { onEnd: () => {} };
    expect(
      telemetryWithKrino(
        { functionId: "desk", recordInputs: false, integrations: callerIntegration },
        krinoIntegration,
      ),
    ).toEqual({
      functionId: "desk",
      recordInputs: false,
      integrations: [callerIntegration, krinoIntegration],
    });
  });

  it("ends the call named by the event and ignores events without a call id", async () => {
    const endedCallIds: Array<string> = [];
    const integration = createKrinoTelemetryIntegration((callId) => endedCallIds.push(callId));

    await integration.onError?.({ callId: "call-1", error: new Error("x") });
    await integration.onError?.("not an event");
    await integration.onError?.({ callId: 7 });
    await integration.onAbort?.({ callId: "call-2", steps: [] });

    expect(endedCallIds).toEqual(["call-1", "call-2"]);
  });
});

describe("readAiSdkVersion", () => {
  it("reads the installed ai version", () => {
    const installedVersion = (
      createRequire(import.meta.url)("ai/package.json") as {
        version: string;
      }
    ).version;
    expect(readAiSdkVersion()).toBe(installedVersion);
    expect(installedVersion).toBe("7.0.126");
  });

  it("returns unknown when ai cannot be read", async () => {
    vi.resetModules();
    vi.doMock("node:module", () => ({
      createRequire: () => () => {
        throw new Error("not installed");
      },
    }));
    const { readAiSdkVersion: readWithoutAi } = await import("./host-sdk-version.js");
    expect(readWithoutAi()).toBe("unknown");
    vi.doUnmock("node:module");
  });
});
