import type {
  HookCallback,
  HookCallbackMatcher,
  HookJSONOutput,
  Options,
} from "@anthropic-ai/claude-agent-sdk";
import { describe, expect, it } from "vitest";
import { krinoAgentOptions } from "./krino-agent-options.js";
import { mergeHooks } from "./merge-hooks.js";
import {
  BENCH_TOOL_DESCRIPTIONS,
  CANCEL_ORDER,
  callHook,
  createTestKrino,
  preToolUseInput,
  TASK_TEXT,
} from "./test-support.js";

type CallLog = Array<string>;

function loggingHook(
  callLog: CallLog,
  hookName: string,
  output: HookJSONOutput = {},
): HookCallback {
  return async () => {
    callLog.push(hookName);
    return output;
  };
}

const krinoMarkerMatcher: HookCallbackMatcher = { hooks: [async () => ({})] };

/** Runs every matching callback in array order, the order the hooks are given to `query()`. */
async function runPreToolUseHooks(
  matchers: ReadonlyArray<HookCallbackMatcher>,
  toolName: string,
): Promise<Array<HookJSONOutput>> {
  const outputs: Array<HookJSONOutput> = [];
  for (const matcher of matchers) {
    if (matcher.matcher !== undefined && !new RegExp(matcher.matcher).test(toolName)) {
      continue;
    }
    for (const hookCallback of matcher.hooks) {
      outputs.push(
        await hookCallback(preToolUseInput(toolName), "tool-use-1", {
          signal: new AbortController().signal,
        }),
      );
    }
  }
  return outputs;
}

function permissionDecisions(outputs: ReadonlyArray<HookJSONOutput>): Array<string> {
  return outputs.flatMap((output) => {
    if (!("hookSpecificOutput" in output) || output.hookSpecificOutput === undefined) {
      return [];
    }
    const specificOutput = output.hookSpecificOutput;
    return specificOutput.hookEventName === "PreToolUse" &&
      specificOutput.permissionDecision !== undefined
      ? [specificOutput.permissionDecision]
      : [];
  });
}

describe("mergeHooks", () => {
  it("keeps the user's PreToolUse matchers in order and adds krino's last", () => {
    const firstMatcher: HookCallbackMatcher = { matcher: "Bash", hooks: [async () => ({})] };
    const secondMatcher: HookCallbackMatcher = { hooks: [async () => ({})] };
    const mergedHooks = mergeHooks(
      { PreToolUse: [firstMatcher, secondMatcher] },
      krinoMarkerMatcher,
    );
    expect(mergedHooks.PreToolUse).toHaveLength(3);
    expect(mergedHooks.PreToolUse?.[0]).toBe(firstMatcher);
    expect(mergedHooks.PreToolUse?.[1]).toBe(secondMatcher);
    expect(mergedHooks.PreToolUse?.[2]).toBe(krinoMarkerMatcher);
  });

  it("passes every other hook event through untouched", () => {
    const postToolUse: Array<HookCallbackMatcher> = [{ hooks: [async () => ({})] }];
    const stopHooks: Array<HookCallbackMatcher> = [{ hooks: [async () => ({})] }];
    const mergedHooks = mergeHooks(
      { PostToolUse: postToolUse, Stop: stopHooks },
      krinoMarkerMatcher,
    );
    expect(mergedHooks.PostToolUse).toBe(postToolUse);
    expect(mergedHooks.Stop).toBe(stopHooks);
    expect(mergedHooks.PreToolUse).toEqual([krinoMarkerMatcher]);
  });

  it("works without user hooks and never mutates them", () => {
    expect(mergeHooks(undefined, krinoMarkerMatcher)).toEqual({ PreToolUse: [krinoMarkerMatcher] });
    const userMatchers: Array<HookCallbackMatcher> = [{ hooks: [async () => ({})] }];
    const userHooks: Options["hooks"] = { PreToolUse: userMatchers };
    mergeHooks(userHooks, krinoMarkerMatcher);
    expect(userHooks.PreToolUse).toBe(userMatchers);
    expect(userMatchers).toHaveLength(1);
  });
});

describe("krinoAgentOptions keeps the user's hooks", () => {
  it("the user's hooks still run, in their original order, before krino's", async () => {
    const callLog: CallLog = [];
    const { krinoRuntime } = createTestKrino();
    const krinoRun = await krinoAgentOptions(
      {
        hooks: {
          PreToolUse: [
            { hooks: [loggingHook(callLog, "user-1"), loggingHook(callLog, "user-2")] },
            { matcher: "mcp__krino-bench__.*", hooks: [loggingHook(callLog, "user-3")] },
            { matcher: "^Bash$", hooks: [loggingHook(callLog, "user-bash-only")] },
          ],
          PostToolUse: [{ hooks: [loggingHook(callLog, "user-post")] }],
        },
      },
      krinoRuntime,
      TASK_TEXT,
      { toolDescriptions: BENCH_TOOL_DESCRIPTIONS },
    );

    const preToolUseMatchers = krinoRun.queryOptions.hooks?.PreToolUse ?? [];
    expect(preToolUseMatchers).toHaveLength(4);
    const krinoMatcher = preToolUseMatchers[3];
    const krinoHook = krinoMatcher?.hooks[0];
    expect(krinoMatcher?.matcher).toBeUndefined(); // krino sees every tool
    expect(krinoHook).toBeDefined();
    if (krinoHook === undefined) {
      return;
    }
    // Put krino's hook in the log too.
    preToolUseMatchers[3] = {
      hooks: [
        async (...hookArguments) => {
          callLog.push("krino");
          return krinoHook(...hookArguments);
        },
      ],
    };

    await runPreToolUseHooks(preToolUseMatchers, CANCEL_ORDER);
    expect(callLog).toEqual(["user-1", "user-2", "user-3", "krino"]);
    expect(krinoRun.queryOptions.hooks?.PostToolUse).toHaveLength(1);
  });

  it("shadow: krino's hook never changes the hook decision, even when the gate suggests block", async () => {
    const { krinoRuntime } = createTestKrino({
      configFields: {
        riskGatePolicy: {
          blockedToolNames: [CANCEL_ORDER],
          alwaysAllowedToolNames: [],
          allowThresholdByToolName: {},
        },
      },
    });
    const userDecisions: Array<HookJSONOutput> = [
      { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow" } },
      { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny" } },
      {},
    ];
    for (const userDecision of userDecisions) {
      const userMatchers: Array<HookCallbackMatcher> = [{ hooks: [async () => userDecision] }];
      const krinoRun = await krinoAgentOptions(
        { hooks: { PreToolUse: userMatchers } },
        krinoRuntime,
        TASK_TEXT,
        { toolDescriptions: BENCH_TOOL_DESCRIPTIONS },
      );
      const withKrino = await runPreToolUseHooks(
        krinoRun.queryOptions.hooks?.PreToolUse ?? [],
        CANCEL_ORDER,
      );
      const userOnly = await runPreToolUseHooks(userMatchers, CANCEL_ORDER);
      expect(permissionDecisions(withKrino)).toEqual(permissionDecisions(userOnly));
      expect(withKrino.at(-1)).toEqual({});
    }
  });

  it("krino's hook alone returns an empty output in shadow mode", async () => {
    const { krinoRuntime } = createTestKrino();
    const krinoRun = await krinoAgentOptions({}, krinoRuntime, TASK_TEXT, {
      toolDescriptions: BENCH_TOOL_DESCRIPTIONS,
    });
    const krinoHook = krinoRun.queryOptions.hooks?.PreToolUse?.[0]?.hooks[0];
    expect(krinoHook).toBeDefined();
    if (krinoHook !== undefined) {
      await expect(callHook(krinoHook, CANCEL_ORDER)).resolves.toEqual({});
    }
  });
});
