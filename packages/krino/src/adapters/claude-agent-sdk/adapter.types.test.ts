// Type-level checks against the installed Claude Agent SDK (0.3.286, the pinned devDependency).
// `expectTypeOf` is checked by `tsc` (the `typecheck` task): if the SDK renames a hook, an option
// or a result field the adapter relies on, the build fails here first.

import {
  HOOK_EVENTS,
  type HookCallback,
  type HookCallbackMatcher,
  type HookEvent,
  type HookInput,
  type HookJSONOutput,
  type HookPermissionDecision,
  type ModelUsage,
  type Options,
  type PreToolUseHookInput,
  type PreToolUseHookSpecificOutput,
  type Query,
  type SDKMessage,
  type SDKResultMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { KrinoRuntime, ToolDescription } from "../../contracts/index.js";
import type { KrinoAgentAdapterOptions, KrinoAgentRun } from "./krino-agent-options.js";
import { krinoAgentOptions } from "./krino-agent-options.js";
import { mergeHooks } from "./merge-hooks.js";
import { observeKrinoMessages } from "./observe-krino-messages.js";
import { createKrinoPreToolUseHook, hookOutputForVerdict } from "./pre-tool-use-hook.js";

describe("Claude Agent SDK 0.3.286: hooks", () => {
  it("PreToolUse is a hook event (types and runtime list)", () => {
    expectTypeOf<"PreToolUse">().toExtend<HookEvent>();
    expect(HOOK_EVENTS).toContain("PreToolUse");
  });

  it("HookCallback is (input, toolUseID, { signal }) => Promise<HookJSONOutput>", () => {
    expectTypeOf<HookCallback>().parameters.toEqualTypeOf<
      [HookInput, string | undefined, { signal: AbortSignal }]
    >();
    expectTypeOf<HookCallback>().returns.toEqualTypeOf<Promise<HookJSONOutput>>();
    expectTypeOf(createKrinoPreToolUseHook).returns.toEqualTypeOf<HookCallback>();
  });

  it("HookCallbackMatcher is { matcher?, hooks, timeout? }", () => {
    expectTypeOf<HookCallbackMatcher>().toEqualTypeOf<{
      matcher?: string;
      hooks: Array<HookCallback>;
      timeout?: number;
    }>();
  });

  it("PreToolUseHookInput carries hook_event_name, tool_name, tool_input and tool_use_id", () => {
    expectTypeOf<PreToolUseHookInput["hook_event_name"]>().toEqualTypeOf<"PreToolUse">();
    expectTypeOf<PreToolUseHookInput["tool_name"]>().toEqualTypeOf<string>();
    expectTypeOf<PreToolUseHookInput["tool_input"]>().toEqualTypeOf<unknown>();
    expectTypeOf<PreToolUseHookInput["tool_use_id"]>().toEqualTypeOf<string>();
    expectTypeOf<PreToolUseHookInput>().toExtend<HookInput>();
  });

  it("PreToolUse output: permissionDecision is allow | deny | ask | defer", () => {
    expectTypeOf<HookPermissionDecision>().toEqualTypeOf<"allow" | "deny" | "ask" | "defer">();
    expectTypeOf<PreToolUseHookSpecificOutput["permissionDecision"]>().toEqualTypeOf<
      HookPermissionDecision | undefined
    >();
    expectTypeOf(hookOutputForVerdict).returns.toEqualTypeOf<HookJSONOutput>();
  });
});

describe("Claude Agent SDK 0.3.286: query options", () => {
  it("allowedTools, disallowedTools, hooks and model have the shapes the adapter uses", () => {
    expectTypeOf<Options["allowedTools"]>().toEqualTypeOf<Array<string> | undefined>();
    expectTypeOf<Options["disallowedTools"]>().toEqualTypeOf<Array<string> | undefined>();
    expectTypeOf<Options["hooks"]>().toEqualTypeOf<
      Partial<Record<HookEvent, Array<HookCallbackMatcher>>> | undefined
    >();
    expectTypeOf<Options["model"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf(mergeHooks).returns.toExtend<NonNullable<Options["hooks"]>>();
  });

  it("krinoAgentOptions takes and returns query() options", () => {
    expectTypeOf(krinoAgentOptions).parameters.toEqualTypeOf<
      [Options, KrinoRuntime, string, (KrinoAgentAdapterOptions | undefined)?]
    >();
    expectTypeOf<KrinoAgentRun["queryOptions"]>().toEqualTypeOf<Options>();
    expectTypeOf<KrinoAgentAdapterOptions["toolDescriptions"]>().toEqualTypeOf<
      Array<ToolDescription> | undefined
    >();
  });
});

describe("Claude Agent SDK 0.3.286: message stream and result", () => {
  it("query() returns an async stream of SDKMessage that observeKrinoMessages accepts", () => {
    expectTypeOf<Query>().toExtend<AsyncIterable<SDKMessage>>();
    expectTypeOf(observeKrinoMessages<SDKMessage>)
      .parameter(0)
      .toEqualTypeOf<AsyncIterable<SDKMessage>>();
  });

  it("result messages carry total_cost_usd, num_turns and per-model usage", () => {
    expectTypeOf<SDKResultMessage>().toExtend<SDKMessage>();
    expectTypeOf<SDKResultMessage["type"]>().toEqualTypeOf<"result">();
    expectTypeOf<SDKResultMessage["total_cost_usd"]>().toEqualTypeOf<number>();
    expectTypeOf<SDKResultMessage["num_turns"]>().toEqualTypeOf<number>();
    expectTypeOf<SDKResultMessage["modelUsage"]>().toEqualTypeOf<Record<string, ModelUsage>>();
  });

  it("ModelUsage has input, output, cache read and cache creation token counts", () => {
    expectTypeOf<ModelUsage["inputTokens"]>().toEqualTypeOf<number>();
    expectTypeOf<ModelUsage["outputTokens"]>().toEqualTypeOf<number>();
    expectTypeOf<ModelUsage["cacheReadInputTokens"]>().toEqualTypeOf<number>();
    expectTypeOf<ModelUsage["cacheCreationInputTokens"]>().toEqualTypeOf<number>();
  });
});
