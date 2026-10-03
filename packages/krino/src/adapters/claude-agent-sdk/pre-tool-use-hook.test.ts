import type { HookCallback, HookInput } from "@anthropic-ai/claude-agent-sdk";
import { describe, expect, it, vi } from "vitest";
import type {
  DecisionRecord,
  RiskGateOutcome,
  RiskGateVerdict,
  RunHandle,
} from "../../contracts/index.js";
import { createStubKrino } from "../../contracts/stub-runtime.js";
import type { AgentRunState } from "./agent-run-state.js";
import { createKrinoPreToolUseHook, hookOutputForVerdict } from "./pre-tool-use-hook.js";
import {
  APPROVE_REFUND,
  CANCEL_ORDER,
  callHook,
  GET_ORDER_DETAILS,
  PROTOTYPE_KEY_NAMES,
  preToolUseInput,
} from "./test-support.js";

function emptyRunState(): AgentRunState {
  return {
    hostSdkVersion: "0.3.286",
    requestedModelIdentifier: null,
    availableToolNames: [],
    toolSelectionLatencyInMilliseconds: 0,
    toolCallCount: 0,
    toolCallSteps: [],
    usedToolNames: new Set(),
    finishPromise: null,
  };
}

function stubRunHandle() {
  const stubKrino = createStubKrino({ projectName: "hook-test", decisionModes: {} });
  const runHandle = stubKrino.startRun({
    hostName: "claude-agent-sdk",
    hostSdkVersion: "0.3.286",
    capabilities: {
      supportedDecisions: ["toolSelection", "riskGate"],
      toolSelectionTiming: "runStartOnly",
      reportsPerStepUsage: false,
    },
  });
  return { stubKrino, runHandle };
}

const riskDecisionRecord: DecisionRecord = {
  decisionKind: "riskGate",
  decisionMode: "enforce",
  decisionStatus: "answered",
  suggestedChoice: "block",
  appliedChoice: "block",
  probability: 0.9,
  decisionModelVersion: "test-model-1",
  latencyInMilliseconds: 5,
  decisionCostInUsd: null,
};

/** A run handle whose risk gate applies a fixed verdict, as an enforce-mode gate would. */
function enforcingRunHandle(verdictToApply: RiskGateVerdict | null): RunHandle {
  const { runHandle } = stubRunHandle();
  return {
    ...runHandle,
    checkToolCallRisk: async (): Promise<RiskGateOutcome> => ({
      verdictToApply,
      suggestedVerdict: verdictToApply ?? "askHuman",
      decisionRecord: riskDecisionRecord,
    }),
  };
}

describe("krino's PreToolUse hook", () => {
  it("checks risk with stepNumber = the 1-based index of the tool call in the run", async () => {
    const { stubKrino, runHandle } = stubRunHandle();
    const runState = emptyRunState();
    const krinoHook = createKrinoPreToolUseHook(runHandle, runState);

    await callHook(krinoHook, GET_ORDER_DETAILS);
    await callHook(krinoHook, CANCEL_ORDER);
    await callHook(krinoHook, GET_ORDER_DETAILS);

    expect(stubKrino.riskGateRequests).toEqual([
      expect.objectContaining({ stepNumber: 1, toolName: GET_ORDER_DETAILS }),
      expect.objectContaining({ stepNumber: 2, toolName: CANCEL_ORDER }),
      expect.objectContaining({ stepNumber: 3, toolName: GET_ORDER_DETAILS }),
    ]);
    expect(stubKrino.riskGateRequests[0]).toMatchObject({
      runIdentifier: runHandle.runIdentifier,
      toolArguments: { orderId: "ORD-10422" },
    });
    expect(runState.toolCallSteps.map((toolCallStep) => toolCallStep.stepNumber)).toEqual([
      1, 2, 3,
    ]);
    expect([...runState.usedToolNames]).toEqual([GET_ORDER_DETAILS, CANCEL_ORDER]);
  });

  it("counts subagent tool calls in the same index", async () => {
    const { stubKrino, runHandle } = stubRunHandle();
    const krinoHook = createKrinoPreToolUseHook(runHandle, emptyRunState());
    await callHook(krinoHook, CANCEL_ORDER);
    await krinoHook(
      { ...preToolUseInput(APPROVE_REFUND), agent_id: "subagent-1", agent_type: "general-purpose" },
      "tool-use-2",
      { signal: new AbortController().signal },
    );
    expect(stubKrino.riskGateRequests.map((pendingCall) => pendingCall.stepNumber)).toEqual([1, 2]);
  });

  it("handles prototype-key tool names", async () => {
    const { stubKrino, runHandle } = stubRunHandle();
    const runState = emptyRunState();
    const krinoHook = createKrinoPreToolUseHook(runHandle, runState);
    for (const toolName of PROTOTYPE_KEY_NAMES) {
      await expect(callHook(krinoHook, toolName)).resolves.toEqual({});
    }
    expect([...runState.usedToolNames]).toEqual([...PROTOTYPE_KEY_NAMES]);
    expect(stubKrino.riskGateRequests.map((pendingCall) => pendingCall.toolName)).toEqual([
      ...PROTOTYPE_KEY_NAMES,
    ]);
  });

  it("sends tool arguments only when the tool input is an object", async () => {
    const { stubKrino, runHandle } = stubRunHandle();
    const krinoHook = createKrinoPreToolUseHook(runHandle, emptyRunState());
    const signal = new AbortController().signal;
    for (const toolInput of [null, "text", 42, ["a"], { orderId: "ORD-1" }]) {
      await krinoHook(preToolUseInput(CANCEL_ORDER, toolInput), "tool-use", { signal });
    }
    expect(stubKrino.riskGateRequests.map((pendingCall) => pendingCall.toolArguments)).toEqual([
      {},
      {},
      {},
      {},
      { orderId: "ORD-1" },
    ]);
  });

  it("ignores other hook events and does not count them", async () => {
    const { stubKrino, runHandle } = stubRunHandle();
    const runState = emptyRunState();
    const krinoHook = createKrinoPreToolUseHook(runHandle, runState);
    const stopInput = {
      hook_event_name: "Stop",
      session_id: "session-under-test",
      transcript_path: "transcript.jsonl",
      cwd: ".",
      stop_hook_active: false,
    } as HookInput;
    await expect(
      krinoHook(stopInput, undefined, { signal: new AbortController().signal }),
    ).resolves.toEqual({});
    expect(runState.toolCallCount).toBe(0);
    expect(stubKrino.riskGateRequests).toHaveLength(0);
  });

  it("never throws into the host: a failing risk check leaves the decision unchanged", async () => {
    const { runHandle } = stubRunHandle();
    const failingRunHandle: RunHandle = {
      ...runHandle,
      checkToolCallRisk: async () => {
        throw new Error("runtime broke");
      },
    };
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const runState = emptyRunState();
    const krinoHook: HookCallback = createKrinoPreToolUseHook(failingRunHandle, runState);
    await expect(callHook(krinoHook, CANCEL_ORDER)).resolves.toEqual({});
    expect(runState.usedToolNames.has(CANCEL_ORDER)).toBe(true);
    expect(consoleWarn).toHaveBeenCalledWith(
      "krino: risk check failed unexpectedly: Error: runtime broke",
    );
    consoleWarn.mockRestore();
  });
});

describe("enforce verdict mapping (unreachable in v0.1: config rejects riskGate enforce)", () => {
  it("block → deny, askHuman → ask, allow or no verdict → unchanged; krino never says allow", async () => {
    expect(hookOutputForVerdict("block")).toEqual({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: "krino risk gate: block",
      },
    });
    expect(hookOutputForVerdict("askHuman")).toEqual({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason: "krino risk gate: askHuman",
      },
    });
    expect(hookOutputForVerdict("allow")).toEqual({});
    expect(hookOutputForVerdict(null)).toEqual({});
  });

  it.each([
    ["block", "deny"],
    ["askHuman", "ask"],
  ] as const)("the hook applies %s as %s", async (verdict, permissionDecision) => {
    const runState = emptyRunState();
    const krinoHook = createKrinoPreToolUseHook(enforcingRunHandle(verdict), runState);
    await expect(callHook(krinoHook, CANCEL_ORDER)).resolves.toMatchObject({
      hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision },
    });
    expect(runState.toolCallSteps[0]?.riskDecisionRecord).toBe(riskDecisionRecord);
  });

  it("the hook leaves an allow verdict to the host's own permission checks", async () => {
    const krinoHook = createKrinoPreToolUseHook(enforcingRunHandle("allow"), emptyRunState());
    await expect(callHook(krinoHook, CANCEL_ORDER)).resolves.toEqual({});
  });
});
