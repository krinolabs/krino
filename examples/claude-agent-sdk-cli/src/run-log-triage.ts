import type { Options, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import {
  BENCH_MCP_SERVER_NAME,
  toAgentSdkMcpServer,
  toClaudeAgentSdkToolName,
} from "@krinolabs/bench/claude-agent-sdk";
import { createFileTraceSink, createKrino, type DecisionProvider } from "@krinolabs/krino";
import { krinoAgentOptions, observeKrinoMessages } from "@krinolabs/krino/claude-agent-sdk";
import {
  createLogTriageKrinoConfig,
  FLUSH_TIMEOUT_IN_MILLISECONDS,
  LIVE_MODEL_IDENTIFIER,
  MAX_TURN_COUNT,
  PROJECT_NAME,
  SYSTEM_PROMPT,
  selectLogTriageToolNames,
  type ToolCount,
  toAgentToolDescriptions,
} from "./log-triage.js";
import type { ResolvedExampleTask } from "./log-triage-tasks.js";

/** Starts the agent: the real `query()` when live, a scripted message stream with --fake. */
export type StartAgent = (queryOptions: Options) => AsyncIterable<SDKMessage>;

export type LogTriageRunOptions = {
  startAgent: StartAgent;
  decisionProvider: DecisionProvider;
  traceDirectory: string;
  toolCount: ToolCount;
  task: ResolvedExampleTask;
};

export type LogTriageResult = {
  answerText: string;
  /** From the `result` message; `null` if the stream ended without one. */
  turnCount: number | null;
  /** Tools the agent called (bench names), in first-call order. */
  usedToolNames: Array<string>;
  totalCostInUsd: number | null;
};

const AGENT_TOOL_NAME_PREFIX = toClaudeAgentSdkToolName("");

/** Only the bench MCP tools: no built-in Claude Code tools, no settings files, no session file. */
function buildQueryOptions(toolNames: ReadonlyArray<string>): Options {
  return {
    model: LIVE_MODEL_IDENTIFIER,
    systemPrompt: SYSTEM_PROMPT,
    tools: [],
    mcpServers: { [BENCH_MCP_SERVER_NAME]: toAgentSdkMcpServer(toolNames) },
    allowedTools: toolNames.map(toClaudeAgentSdkToolName),
    maxTurns: MAX_TURN_COUNT,
    settingSources: [],
    persistSession: false,
  };
}

/** Tool names from an assistant message's `tool_use` blocks. */
function toolUseNamesOf(message: SDKMessage): Array<string> {
  if (message.type !== "assistant") {
    return [];
  }
  const contentBlocks: unknown = message.message.content;
  if (!Array.isArray(contentBlocks)) {
    return [];
  }
  return contentBlocks.flatMap((contentBlock: unknown) =>
    typeof contentBlock === "object" &&
    contentBlock !== null &&
    "type" in contentBlock &&
    contentBlock.type === "tool_use" &&
    "name" in contentBlock &&
    typeof contentBlock.name === "string"
      ? [contentBlock.name]
      : [],
  );
}

function toBenchToolName(agentToolName: string): string {
  return agentToolName.startsWith(AGENT_TOOL_NAME_PREFIX)
    ? agentToolName.slice(AGENT_TOOL_NAME_PREFIX.length)
    : agentToolName;
}

/** Runs the agent once with krino in shadow mode, then waits until the traces are written. */
export async function runLogTriage(runOptions: LogTriageRunOptions): Promise<LogTriageResult> {
  const toolNames = selectLogTriageToolNames(
    runOptions.toolCount,
    runOptions.task.expectedToolNames,
  );
  const toolDescriptions = toAgentToolDescriptions(toolNames);
  const krino = createKrino(
    createLogTriageKrinoConfig({
      toolNames,
      decisionProvider: runOptions.decisionProvider,
      traceSink: createFileTraceSink({
        projectName: PROJECT_NAME,
        traceDirectory: runOptions.traceDirectory,
      }),
    }),
  );
  const krinoRun = await krinoAgentOptions(
    buildQueryOptions(toolNames),
    krino,
    runOptions.task.taskText,
    { toolDescriptions },
  );

  const triageResult: LogTriageResult = {
    answerText: "",
    turnCount: null,
    usedToolNames: [],
    totalCostInUsd: null,
  };
  const usedToolNames = new Set<string>();
  // observeKrinoMessages records the run as the messages pass, and at the end waits (bounded)
  // until the run's traces are written.
  for await (const message of observeKrinoMessages(
    runOptions.startAgent(krinoRun.queryOptions),
    krinoRun,
  )) {
    for (const toolName of toolUseNamesOf(message)) {
      usedToolNames.add(toBenchToolName(toolName));
    }
    if (message.type === "result") {
      triageResult.answerText = message.subtype === "success" ? message.result : message.subtype;
      triageResult.turnCount = message.num_turns;
      triageResult.totalCostInUsd = message.total_cost_usd;
    }
  }
  await krino.flushAll(FLUSH_TIMEOUT_IN_MILLISECONDS);
  triageResult.usedToolNames = [...usedToolNames];
  return triageResult;
}
