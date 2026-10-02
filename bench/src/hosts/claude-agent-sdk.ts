import {
  createSdkMcpServer,
  type McpSdkServerConfigWithInstance,
  tool,
} from "@anthropic-ai/claude-agent-sdk";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { buildInputShape } from "../catalog/input-schema.js";
import { findMockTool } from "../catalog/mock-tool-catalog.js";
import type { MockToolDefinition } from "../catalog/mock-tool-definition.js";
import { executeMockTool, type MockToolExecutionOutcome } from "../executor/execute-mock-tool.js";

export const BENCH_MCP_SERVER_NAME = "krino-bench";
export const BENCH_MCP_SERVER_VERSION = "0.0.0";

export type AgentSdkMcpServerOptions = {
  /**
   * true (default): every tool stays in the prompt and is never deferred behind tool search
   * (the Agent SDK `alwaysLoad` option), so the bench measures the full tool list, as the
   * AI SDK host sends it. false: the Agent SDK default, which defers tools when tool search is on.
   */
  loadAllTools?: boolean;
};

/** The name the Claude Agent SDK gives a tool of this server, for `allowedTools` and hooks. */
export function toClaudeAgentSdkToolName(toolName: string): string {
  return `mcp__${BENCH_MCP_SERVER_NAME}__${toolName}`;
}

export function toCallToolResult(executionOutcome: MockToolExecutionOutcome): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(executionOutcome) }],
    isError: executionOutcome.executionStatus === "failed",
  };
}

/** Catalog tools for the names, in the given order, without repeats. Throws on unknown names. */
function resolveToolDefinitions(toolNames: ReadonlyArray<string>): Array<MockToolDefinition> {
  const uniqueToolNames = [...new Set(toolNames)];
  const unknownToolNames = uniqueToolNames.filter(
    (toolName) => findMockTool(toolName) === undefined,
  );
  if (unknownToolNames.length > 0) {
    throw new Error(`Unknown bench tools: ${unknownToolNames.join(", ")}`);
  }
  return uniqueToolNames.flatMap((toolName) => findMockTool(toolName) ?? []);
}

/**
 * The named catalog tools as an in-process MCP server for the Claude Agent SDK.
 * Pass `MOCK_TOOL_NAMES` for the full catalog. Throws at setup if a name is not in the catalog.
 * Use the result as `options.mcpServers[BENCH_MCP_SERVER_NAME]` in `query()`.
 */
export function toAgentSdkMcpServer(
  toolNames: ReadonlyArray<string>,
  serverOptions: AgentSdkMcpServerOptions = {},
): McpSdkServerConfigWithInstance {
  return createSdkMcpServer({
    name: BENCH_MCP_SERVER_NAME,
    version: BENCH_MCP_SERVER_VERSION,
    alwaysLoad: serverOptions.loadAllTools ?? true,
    tools: resolveToolDefinitions(toolNames).map((toolDefinition) =>
      tool(
        toolDefinition.toolName,
        toolDefinition.toolDescription,
        buildInputShape(toolDefinition),
        async (toolArguments) =>
          toCallToolResult(executeMockTool(toolDefinition.toolName, toolArguments)),
      ),
    ),
  });
}
