import type { Options } from "@anthropic-ai/claude-agent-sdk";
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolDescription } from "../../contracts/index.js";
import { createStubKrino } from "../../contracts/stub-runtime.js";
import {
  answerToolsNeeded,
  createLocalTestProvider,
  TEST_DECISION_MODEL_VERSION,
} from "../../core/local-test-doubles.js";
import { CLAUDE_AGENT_SDK_CAPABILITIES, krinoAgentOptions } from "./krino-agent-options.js";
import {
  APPROVE_REFUND,
  BENCH_TOOL_DESCRIPTIONS,
  benchToolName,
  CANCEL_ORDER,
  createTestKrino,
  GET_ORDER_DETAILS,
  LIST_ORDER_REFUNDS,
  PROTOTYPE_KEY_NAMES,
  TASK_TEXT,
} from "./test-support.js";
import { forgetWarningsForTests } from "./warn-once.js";

const MISSING_DESCRIPTIONS_WARNING =
  "krino: tool selection skipped because no toolDescriptions were passed to " +
  "krinoAgentOptions(). Pass { toolDescriptions } to enable it.";

let consoleWarn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  forgetWarningsForTests();
  consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function userOptions(optionFields: Partial<Options> = {}): Options {
  return {
    model: "claude-haiku-4-5",
    allowedTools: [GET_ORDER_DETAILS],
    disallowedTools: ["WebFetch"],
    ...optionFields,
  };
}

/** Everything krino may change is tool availability (`disallowedTools`) and `hooks`. */
function withoutKrinoFields(queryOptions: Options): Options {
  const { disallowedTools: _disallowedTools, hooks: _hooks, ...otherOptions } = queryOptions;
  return otherOptions;
}

describe("krinoAgentOptions: run start", () => {
  it("decides tool selection once, at run start, as step 0", async () => {
    const { krinoRuntime, decisionProvider } = createTestKrino();
    const krinoRun = await krinoAgentOptions(userOptions(), krinoRuntime, TASK_TEXT, {
      toolDescriptions: BENCH_TOOL_DESCRIPTIONS,
    });
    await vi.waitFor(() => expect(decisionProvider.recordedCalls).toHaveLength(1));
    expect(decisionProvider.recordedCalls[0]?.stepContext).toMatchObject({
      runIdentifier: krinoRun.runHandle.runIdentifier,
      stepNumber: 0,
      taskText: TASK_TEXT,
      availableTools: BENCH_TOOL_DESCRIPTIONS,
      recentMessagesText: "",
    });
  });

  it("starts the run as the Claude Agent SDK host with the card's capabilities", async () => {
    const stubKrino = createStubKrino({
      projectName: "claude-agent-sdk-adapter-test",
      decisionModes: {},
    });
    await krinoAgentOptions(userOptions(), stubKrino, TASK_TEXT, {
      toolDescriptions: BENCH_TOOL_DESCRIPTIONS,
    });
    expect(CLAUDE_AGENT_SDK_CAPABILITIES).toEqual({
      supportedDecisions: ["toolSelection", "riskGate"],
      toolSelectionTiming: "runStartOnly",
      reportsPerStepUsage: false,
    });
    expect(stubKrino.startedRuns[0]).toMatchObject({
      hostName: "claude-agent-sdk",
      hostSdkVersion: "0.3.286",
      capabilities: CLAUDE_AGENT_SDK_CAPABILITIES,
    });
    expect(stubKrino.toolSelectionRequests[0]?.stepNumber).toBe(0);
  });

  it("does not mutate the user's options", async () => {
    const { krinoRuntime } = createTestKrino({ toolSelectionMode: "enforce" });
    const queryOptions = userOptions({ hooks: { PreToolUse: [] } });
    const snapshot = structuredClone(queryOptions);
    await krinoAgentOptions(queryOptions, krinoRuntime, TASK_TEXT, {
      toolDescriptions: BENCH_TOOL_DESCRIPTIONS,
    });
    expect(queryOptions).toEqual(snapshot);
  });
});

describe("krinoAgentOptions: enforce prunes with disallowedTools only", () => {
  it("disallows the known tools that were not suggested, after the user's entries", async () => {
    const { krinoRuntime } = createTestKrino({
      toolSelectionMode: "enforce",
      decisionProvider: createLocalTestProvider(answerToolsNeeded([CANCEL_ORDER], 0.95)),
    });
    const queryOptions = userOptions();
    const krinoRun = await krinoAgentOptions(queryOptions, krinoRuntime, TASK_TEXT, {
      toolDescriptions: BENCH_TOOL_DESCRIPTIONS,
    });
    expect(krinoRun.queryOptions.disallowedTools).toEqual([
      "WebFetch",
      GET_ORDER_DETAILS,
      LIST_ORDER_REFUNDS,
      APPROVE_REFUND,
    ]);
    // Availability changes, approval does not.
    expect(krinoRun.queryOptions.allowedTools).toBe(queryOptions.allowedTools);
    expect(withoutKrinoFields(krinoRun.queryOptions)).toEqual(withoutKrinoFields(queryOptions));
  });

  it("never disallows a tool krino does not know, such as a built-in tool", async () => {
    const { krinoRuntime } = createTestKrino({
      toolSelectionMode: "enforce",
      decisionProvider: createLocalTestProvider(answerToolsNeeded([], 0.95)),
    });
    const krinoRun = await krinoAgentOptions(
      { allowedTools: ["Bash", "Read"] },
      krinoRuntime,
      TASK_TEXT,
      { toolDescriptions: [BENCH_TOOL_DESCRIPTIONS[0] as ToolDescription] },
    );
    expect(krinoRun.queryOptions.disallowedTools).toEqual([CANCEL_ORDER]);
    expect(krinoRun.queryOptions.allowedTools).toEqual(["Bash", "Read"]);
  });

  it("works when the user set no allowedTools and no disallowedTools", async () => {
    const { krinoRuntime } = createTestKrino({
      toolSelectionMode: "enforce",
      decisionProvider: createLocalTestProvider(answerToolsNeeded([CANCEL_ORDER], 0.95)),
    });
    const krinoRun = await krinoAgentOptions({}, krinoRuntime, TASK_TEXT, {
      toolDescriptions: BENCH_TOOL_DESCRIPTIONS,
    });
    expect(krinoRun.queryOptions.disallowedTools).toEqual([
      GET_ORDER_DETAILS,
      LIST_ORDER_REFUNDS,
      APPROVE_REFUND,
    ]);
    expect(Object.hasOwn(krinoRun.queryOptions, "allowedTools")).toBe(false);
  });

  it("handles MCP and prototype-key tool names", async () => {
    const toolDescriptions = PROTOTYPE_KEY_NAMES.map((toolName) => ({
      toolName,
      toolDescription: `A tool named ${toolName}.`,
    }));
    const { krinoRuntime } = createTestKrino({
      toolSelectionMode: "enforce",
      decisionProvider: createLocalTestProvider(answerToolsNeeded(["constructor"], 0.95)),
    });
    const krinoRun = await krinoAgentOptions(
      { disallowedTools: ["toString"] },
      krinoRuntime,
      TASK_TEXT,
      { toolDescriptions },
    );
    expect(krinoRun.queryOptions.disallowedTools).toEqual(["toString", "__proto__"]);
  });

  it("property: keeps every user entry, adds only known tools, never touches allowedTools", async () => {
    const toolNameArbitrary = fc.oneof(
      fc.constantFrom(...PROTOTYPE_KEY_NAMES, "Bash", "Read"),
      fc.stringMatching(/^[a-z_]{1,10}$/).map(benchToolName),
    );
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(toolNameArbitrary, { minLength: 1, maxLength: 8 }),
        fc.array(fc.boolean(), { minLength: 8, maxLength: 8 }),
        fc.option(fc.array(toolNameArbitrary, { maxLength: 6 }), { nil: undefined }),
        fc.option(fc.array(toolNameArbitrary, { maxLength: 6 }), { nil: undefined }),
        async (knownToolNames, suggestionFlags, userAllowedTools, userDisallowedTools) => {
          const suggestedToolNames = knownToolNames.filter((_, index) => suggestionFlags[index]);
          const { krinoRuntime } = createTestKrino({
            toolSelectionMode: "enforce",
            decisionProvider: createLocalTestProvider(answerToolsNeeded(suggestedToolNames, 1)),
          });
          const queryOptions: Options = {};
          if (userAllowedTools !== undefined) {
            queryOptions.allowedTools = userAllowedTools;
          }
          if (userDisallowedTools !== undefined) {
            queryOptions.disallowedTools = userDisallowedTools;
          }
          const allowedSnapshot = userAllowedTools?.slice();

          const krinoRun = await krinoAgentOptions(queryOptions, krinoRuntime, TASK_TEXT, {
            toolDescriptions: knownToolNames.map((toolName) => ({
              toolName,
              toolDescription: `Tool ${toolName}.`,
            })),
          });

          const resultOptions = krinoRun.queryOptions;
          expect(Object.hasOwn(resultOptions, "allowedTools")).toBe(userAllowedTools !== undefined);
          expect(resultOptions.allowedTools).toBe(queryOptions.allowedTools);
          expect(resultOptions.allowedTools).toEqual(allowedSnapshot);

          const userEntries = userDisallowedTools ?? [];
          const disallowedTools = resultOptions.disallowedTools ?? [];
          expect(disallowedTools.slice(0, userEntries.length)).toEqual(userEntries);
          const knownToolNameSet = new Set(knownToolNames);
          for (const addedToolName of disallowedTools.slice(userEntries.length)) {
            expect(knownToolNameSet.has(addedToolName)).toBe(true);
            expect(suggestedToolNames.includes(addedToolName)).toBe(false);
          }
        },
      ),
      { numRuns: 60 },
    );
  });
});

describe("krinoAgentOptions: availability unchanged unless enforce has a confident answer", () => {
  async function disallowedToolsFor(testOptions: Parameters<typeof createTestKrino>[0]) {
    const { krinoRuntime } = createTestKrino(testOptions);
    const queryOptions = userOptions();
    const krinoRun = await krinoAgentOptions(queryOptions, krinoRuntime, TASK_TEXT, {
      toolDescriptions: BENCH_TOOL_DESCRIPTIONS,
    });
    expect(withoutKrinoFields(krinoRun.queryOptions)).toEqual(withoutKrinoFields(queryOptions));
    return krinoRun.queryOptions.disallowedTools;
  }

  it("shadow", async () => {
    expect(await disallowedToolsFor({ toolSelectionMode: "shadow" })).toEqual(["WebFetch"]);
  });

  it("shadow leaves disallowedTools absent when the user set none", async () => {
    const { krinoRuntime } = createTestKrino({ toolSelectionMode: "shadow" });
    const krinoRun = await krinoAgentOptions({}, krinoRuntime, TASK_TEXT, {
      toolDescriptions: BENCH_TOOL_DESCRIPTIONS,
    });
    expect(Object.hasOwn(krinoRun.queryOptions, "disallowedTools")).toBe(false);
  });

  it("off", async () => {
    expect(await disallowedToolsFor({ toolSelectionMode: "off" })).toEqual(["WebFetch"]);
  });

  it("enforce, provider times out", async () => {
    expect(
      await disallowedToolsFor({
        toolSelectionMode: "enforce",
        decisionProvider: createLocalTestProvider(answerToolsNeeded([CANCEL_ORDER], 1), 1_000),
        configFields: { decisionTimeoutInMilliseconds: 10 },
      }),
    ).toEqual(["WebFetch"]);
  });

  it("enforce, provider fails", async () => {
    expect(
      await disallowedToolsFor({
        toolSelectionMode: "enforce",
        decisionProvider: createLocalTestProvider({
          behaviorKind: "reject",
          rejectionCause: new Error("gateway down"),
        }),
      }),
    ).toEqual(["WebFetch"]);
  });

  it("enforce, probability below the minimum", async () => {
    expect(
      await disallowedToolsFor({
        toolSelectionMode: "enforce",
        decisionProvider: createLocalTestProvider(answerToolsNeeded([CANCEL_ORDER], 0.3)),
      }),
    ).toEqual(["WebFetch"]);
  });

  it("enforce, exploration sample", async () => {
    expect(
      await disallowedToolsFor({
        toolSelectionMode: "enforce",
        configFields: { explorationRate: 0.5, randomSource: () => 0 },
      }),
    ).toEqual(["WebFetch"]);
  });
});

describe("krinoAgentOptions: no toolDescriptions", () => {
  it.each(["shadow", "enforce"] as const)(
    "%s: skips tool selection without asking, leaves options unchanged, warns once",
    async (toolSelectionMode) => {
      const { krinoRuntime, decisionProvider } = createTestKrino({ toolSelectionMode });
      const queryOptions = userOptions();

      const firstRun = await krinoAgentOptions(queryOptions, krinoRuntime, TASK_TEXT);
      const secondRun = await krinoAgentOptions(queryOptions, krinoRuntime, TASK_TEXT, {});

      expect(firstRun.queryOptions.disallowedTools).toEqual(["WebFetch"]);
      expect(secondRun.queryOptions.disallowedTools).toEqual(["WebFetch"]);
      expect(firstRun.toolSelection.decisionRecord).toMatchObject({
        decisionKind: "toolSelection",
        decisionMode: toolSelectionMode,
        decisionStatus: "skippedUnsupported",
        appliedChoice: "",
      });
      expect(decisionProvider.recordedCalls).toHaveLength(0);
      expect(consoleWarn).toHaveBeenCalledTimes(1);
      expect(consoleWarn).toHaveBeenCalledWith(MISSING_DESCRIPTIONS_WARNING);
    },
  );
});

describe("krinoAgentOptions: decision record", () => {
  it("returns the step-0 outcome so the observer can record it", async () => {
    const { krinoRuntime } = createTestKrino({
      toolSelectionMode: "enforce",
      decisionProvider: createLocalTestProvider(answerToolsNeeded([CANCEL_ORDER], 0.95)),
    });
    const krinoRun = await krinoAgentOptions(userOptions(), krinoRuntime, TASK_TEXT, {
      toolDescriptions: BENCH_TOOL_DESCRIPTIONS,
    });
    expect(krinoRun.toolSelection.toolNamesToSend).toEqual([CANCEL_ORDER]);
    expect(krinoRun.toolSelection.decisionRecord).toMatchObject({
      decisionMode: "enforce",
      decisionStatus: "answered",
      suggestedChoice: CANCEL_ORDER,
      appliedChoice: CANCEL_ORDER,
      decisionModelVersion: TEST_DECISION_MODEL_VERSION,
    });
  });
});
