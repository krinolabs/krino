import {
  createSdkMcpServer,
  type McpSdkServerConfigWithInstance,
  tool,
} from "@anthropic-ai/claude-agent-sdk";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { buildInputShape } from "../catalog/input-schema.js";
import { MOCK_TOOL_CATALOG } from "../catalog/mock-tool-catalog.js";
import type { MockToolDefinition } from "../catalog/mock-tool-definition.js";
import { executeMockTool, type MockToolExecutionOutcome } from "../executor/execute-mock-tool.js";

export const BENCH_MCP_SERVER_NAME = "krino-bench";
export const BENCH_MCP_SERVER_VERSION = "0.0.0";

export type BenchMcpServerOptions = {
  toolDefinitions?: ReadonlyArray<MockToolDefinition>;
  /**
   * Keep every tool in the prompt instead of deferring it behind tool search.
   * Defaults to true so that the bench measures the full catalog, as the AI SDK host sends it.
   */
  alwaysLoad?: boolean;
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

/**
 * The catalog as an in-process MCP server for the Claude Agent SDK.
 * Pass it as `options.mcpServers[BENCH_MCP_SERVER_NAME]` to `query()`.
 */
export function createBenchMcpServer(
  serverOptions: BenchMcpServerOptions = {},
): McpSdkServerConfigWithInstance {
  const toolDefinitions = serverOptions.toolDefinitions ?? MOCK_TOOL_CATALOG;
  return createSdkMcpServer({
    name: BENCH_MCP_SERVER_NAME,
    version: BENCH_MCP_SERVER_VERSION,
    alwaysLoad: serverOptions.alwaysLoad ?? true,
    tools: toolDefinitions.map((toolDefinition) =>
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
