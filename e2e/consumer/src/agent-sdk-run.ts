import type {
  HookJSONOutput,
  ModelUsage,
  Options,
  PreToolUseHookInput,
  SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import {
  createFakeDecisionProvider,
  createFileTraceSink,
  createKrino,
  DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS,
} from "@krinolabs/krino";
import { krinoAgentOptions, observeKrinoMessages } from "@krinolabs/krino/claude-agent-sdk";
import {
  ANSWER_TEXT,
  answerLikeAGoodProvider,
  KRINO_RISK_GATE_POLICY,
  LOG_TOOLS,
  PROJECT_NAME,
  SCRIPTED_TOOL_CALLS,
  TASK_TEXT,
} from "./log-task.ts";

// An Agent SDK run as a user would write it: krinoAgentOptions, then observeKrinoMessages over
// the message stream, in shadow mode. A scripted stream stands in for `query()` and runs the
// PreToolUse hooks before each tool call, as the SDK does. No Claude Code process, no API.
// Usage: node agent-sdk-run.ts <traceDirectory>

const SESSION_ID = "e2e-simulated-session";
const MODEL_IDENTIFIER = "claude-haiku-4-5";

const traceDirectory = process.argv[2];
if (traceDirectory === undefined) {
  throw new Error("Usage: node agent-sdk-run.ts <traceDirectory>");
}

/** Agent SDK names for tools served by an in-process MCP server called "logs". */
function agentToolName(toolName: string): string {
  return `mcp__logs__${toolName}`;
}

// The SDK message types carry many fields this stream never reads. This builder fills the ones
// krino reads and casts the rest, as krino's adapter tests do.
function simulatedMessage(messageFields: Record<string, unknown>): SDKMessage {
  return { session_id: SESSION_ID, uuid: crypto.randomUUID(), ...messageFields } as SDKMessage;
}

function isDenied(hookOutput: HookJSONOutput): boolean {
  return (
    "hookSpecificOutput" in hookOutput &&
    hookOutput.hookSpecificOutput?.hookEventName === "PreToolUse" &&
    hookOutput.hookSpecificOutput.permissionDecision === "deny"
  );
}

async function runPreToolUseHooks(
  queryOptions: Options,
  hookInput: PreToolUseHookInput,
): Promise<boolean> {
  let isAllowed = true;
  for (const hookMatcher of queryOptions.hooks?.PreToolUse ?? []) {
    if (
      hookMatcher.matcher !== undefined &&
      !new RegExp(hookMatcher.matcher).test(hookInput.tool_name)
    ) {
      continue;
    }
    for (const hookCallback of hookMatcher.hooks) {
      const hookOutput = await hookCallback(hookInput, hookInput.tool_use_id, {
        signal: new AbortController().signal,
      });
      isAllowed = isAllowed && !isDenied(hookOutput);
    }
  }
  return isAllowed;
}

const modelUsage: ModelUsage = {
  inputTokens: 120 + 270 + 420,
  outputTokens: 30 + 30 + 60,
  cacheReadInputTokens: 900 * 2,
  cacheCreationInputTokens: 900,
  webSearchRequests: 0,
  costUSD: 0.01,
  contextWindow: 200_000,
  maxOutputTokens: 64_000,
};

async function* simulatedQuery(queryOptions: Options): AsyncGenerator<SDKMessage> {
  yield simulatedMessage({
    type: "system",
    subtype: "init",
    model: queryOptions.model ?? MODEL_IDENTIFIER,
    tools: LOG_TOOLS.map((logTool) => agentToolName(logTool.toolName)),
  });
  for (const [callIndex, scriptedToolCall] of SCRIPTED_TOOL_CALLS.entries()) {
    const toolName = agentToolName(scriptedToolCall.toolName);
    const toolUseId = `tool-use-${callIndex}`;
    yield simulatedMessage({
      type: "assistant",
      message: {
        role: "assistant",
        content: [
          { type: "tool_use", id: toolUseId, name: toolName, input: scriptedToolCall.toolInput },
        ],
      },
      parent_tool_use_id: null,
    });
    const isAllowed = await runPreToolUseHooks(queryOptions, {
      hook_event_name: "PreToolUse",
      session_id: SESSION_ID,
      transcript_path: "",
      cwd: process.cwd(),
      tool_name: toolName,
      tool_input: scriptedToolCall.toolInput,
      tool_use_id: toolUseId,
    });
    const logTool = LOG_TOOLS.find((candidate) => candidate.toolName === scriptedToolCall.toolName);
    yield simulatedMessage({
      type: "user",
      message: {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: toolUseId,
            content: isAllowed ? (logTool?.result ?? "") : "Denied by a PreToolUse hook.",
            is_error: !isAllowed,
          },
        ],
      },
      parent_tool_use_id: null,
    });
  }
  yield simulatedMessage({
    type: "assistant",
    message: { role: "assistant", content: [{ type: "text", text: ANSWER_TEXT }] },
    parent_tool_use_id: null,
  });
  yield simulatedMessage({
    type: "result",
    subtype: "success",
    is_error: false,
    result: ANSWER_TEXT,
    num_turns: SCRIPTED_TOOL_CALLS.length + 1,
    total_cost_usd: modelUsage.costUSD,
    modelUsage: { [MODEL_IDENTIFIER]: modelUsage },
    duration_ms: 0,
    duration_api_ms: 0,
  });
}

const krino = createKrino({
  projectName: PROJECT_NAME,
  decisionModes: { toolSelection: "shadow", riskGate: "shadow" },
  decisionProvider: createFakeDecisionProvider({
    answerQuestion: answerLikeAGoodProvider(agentToolName),
  }),
  riskGatePolicy: {
    ...KRINO_RISK_GATE_POLICY,
    alwaysAllowedToolNames: KRINO_RISK_GATE_POLICY.alwaysAllowedToolNames.map(agentToolName),
    allowThresholdByToolName: { [agentToolName("restartService")]: 0.95 },
  },
  traceSink: createFileTraceSink({ projectName: PROJECT_NAME, traceDirectory }),
});

const krinoRun = await krinoAgentOptions({ model: MODEL_IDENTIFIER }, krino, TASK_TEXT, {
  toolDescriptions: LOG_TOOLS.map((logTool) => ({
    toolName: agentToolName(logTool.toolName),
    toolDescription: logTool.toolDescription,
  })),
});

const usedToolNames: Array<string> = [];
let answerText = "";
for await (const message of observeKrinoMessages(simulatedQuery(krinoRun.queryOptions), krinoRun)) {
  if (message.type === "assistant") {
    for (const contentBlock of message.message.content) {
      if (contentBlock.type === "tool_use") {
        usedToolNames.push(contentBlock.name);
      }
    }
  }
  if (message.type === "result" && message.subtype === "success") {
    answerText = message.result;
  }
}
await krino.flushAll(DEFAULT_FLUSH_TIMEOUT_IN_MILLISECONDS);

console.log(JSON.stringify({ usedToolNames, answerText }));
