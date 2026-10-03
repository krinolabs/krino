import { executeMockTool, findMockTool, MOCK_TOOL_CATALOG } from "@krinolabs/bench";
import { createAiSdkToolSet } from "@krinolabs/bench/ai-sdk";
import { generateText, stepCountIs } from "ai";
import { describe, expect, it } from "vitest";
import { createFakeAgentModel, fakeToolInput } from "./fake-agent-model.js";

function toolSetFor(toolNames: ReadonlyArray<string>) {
  return createAiSdkToolSet(toolNames.flatMap((toolName) => findMockTool(toolName) ?? []));
}

describe("fakeToolInput", () => {
  it("builds an input every catalog tool accepts", () => {
    for (const toolDefinition of MOCK_TOOL_CATALOG) {
      const outcome = executeMockTool(toolDefinition.toolName, fakeToolInput(toolDefinition));
      expect(outcome.executionStatus, toolDefinition.toolName).toBe("succeeded");
    }
  });
});

describe("createFakeAgentModel", () => {
  it("calls the expected tools in order, then answers", async () => {
    const expectedToolNames = ["get_request_trace", "search_application_logs"];
    const result = await generateText({
      model: createFakeAgentModel(expectedToolNames),
      prompt: "Why did REQ-7f3a fail?",
      tools: toolSetFor([...expectedToolNames, "list_carriers"]),
      stopWhen: stepCountIs(6),
    });
    expect(result.steps.map((step) => step.toolCalls.map((toolCall) => toolCall.toolName))).toEqual(
      [["get_request_trace"], ["search_application_logs"], []],
    );
  });

  it("answers early when the next expected tool was not offered", async () => {
    const result = await generateText({
      model: createFakeAgentModel(["get_request_trace", "search_application_logs"]),
      prompt: "Why did REQ-7f3a fail?",
      tools: toolSetFor(["get_request_trace"]),
      stopWhen: stepCountIs(6),
    });
    expect(result.steps).toHaveLength(2);
    expect(result.steps[1]?.toolCalls).toEqual([]);
  });

  it("writes the cache on step 0 and reads it while the tool list stays the same", async () => {
    const expectedToolNames = ["get_request_trace", "search_application_logs"];
    const result = await generateText({
      model: createFakeAgentModel(expectedToolNames),
      prompt: "Why did REQ-7f3a fail?",
      tools: toolSetFor(expectedToolNames),
      stopWhen: stepCountIs(6),
    });
    const cacheUsage = result.steps.map((step) => ({
      read: step.usage.inputTokenDetails.cacheReadTokens ?? 0,
      write: step.usage.inputTokenDetails.cacheWriteTokens ?? 0,
    }));
    expect(cacheUsage[0]?.read).toBe(0);
    expect(cacheUsage[0]?.write).toBeGreaterThan(0);
    for (const laterStep of cacheUsage.slice(1)) {
      expect(laterStep.read).toBe(cacheUsage[0]?.write);
      expect(laterStep.write).toBe(0);
    }
  });

  it("writes the cache again on every step whose tool list changed (the per-step trap)", async () => {
    const expectedToolNames = ["get_request_trace", "search_application_logs"];
    const result = await generateText({
      model: createFakeAgentModel(expectedToolNames),
      prompt: "Why did REQ-7f3a fail?",
      tools: toolSetFor([...expectedToolNames, "list_carriers"]),
      prepareStep: ({ stepNumber }) => ({
        activeTools: stepNumber === 0 ? ["get_request_trace"] : ["search_application_logs"],
      }),
      stopWhen: stepCountIs(6),
    });
    const cacheWrites = result.steps.map((step) => step.usage.inputTokenDetails.cacheWriteTokens);
    const cacheReads = result.steps.map((step) => step.usage.inputTokenDetails.cacheReadTokens);
    expect(cacheWrites[0]).toBeGreaterThan(0);
    expect(cacheWrites[1]).toBeGreaterThan(0);
    expect(cacheReads[1]).toBe(0);
    // Step 2 sends the same list as step 1, so it reads.
    expect(cacheReads[2]).toBe(cacheWrites[1]);
  });
});
