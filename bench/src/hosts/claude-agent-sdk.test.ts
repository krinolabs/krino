import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { MOCK_TOOL_CATALOG, MOCK_TOOL_NAMES } from "../catalog/mock-tool-catalog.js";
import { executeMockTool } from "../executor/execute-mock-tool.js";
import {
  type AgentSdkMcpServerOptions,
  BENCH_MCP_SERVER_NAME,
  toAgentSdkMcpServer,
  toCallToolResult,
  toClaudeAgentSdkToolName,
} from "./claude-agent-sdk.js";

const openClients: Array<Client> = [];

async function connectClient(
  toolNames: ReadonlyArray<string> = MOCK_TOOL_NAMES,
  serverOptions: AgentSdkMcpServerOptions = {},
): Promise<Client> {
  const serverConfig = toAgentSdkMcpServer(toolNames, serverOptions);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await serverConfig.instance.connect(serverTransport);
  const client = new Client({ name: "bench-test", version: "0.0.0" });
  await client.connect(clientTransport);
  openClients.push(client);
  return client;
}

afterEach(async () => {
  await Promise.all(openClients.splice(0).map((client) => client.close()));
});

describe("toAgentSdkMcpServer", () => {
  it("returns an in-process SDK server config", () => {
    const serverConfig = toAgentSdkMcpServer(MOCK_TOOL_NAMES);
    expect(serverConfig.type).toBe("sdk");
    expect(serverConfig.name).toBe(BENCH_MCP_SERVER_NAME);
    expect(serverConfig.instance).toBeDefined();
  });

  it("lists all 100 tools with their descriptions", async () => {
    const client = await connectClient();
    const { tools } = await client.listTools();
    expect(tools.map((listedTool) => listedTool.name)).toEqual(
      MOCK_TOOL_CATALOG.map((toolDefinition) => toolDefinition.toolName),
    );
    expect(tools[0]?.description).toBe(MOCK_TOOL_CATALOG[0]?.toolDescription);
    expect(tools[0]?.inputSchema.required).toEqual(["orderId"]);
  });

  it("loads every tool into the prompt by default (loadAllTools)", async () => {
    const client = await connectClient();
    const { tools } = await client.listTools();
    for (const listedTool of tools) {
      expect(listedTool._meta?.["anthropic/alwaysLoad"], listedTool.name).toBe(true);
    }
  });

  it("keeps loadAllTools: true the same as the default", async () => {
    const client = await connectClient(["get_order_status"], { loadAllTools: true });
    const { tools } = await client.listTools();
    expect(tools[0]?._meta?.["anthropic/alwaysLoad"]).toBe(true);
  });

  it("lets the Agent SDK defer tools when loadAllTools is false", async () => {
    const client = await connectClient(MOCK_TOOL_NAMES, { loadAllTools: false });
    const { tools } = await client.listTools();
    expect(tools[0]?._meta?.["anthropic/alwaysLoad"]).not.toBe(true);
  });

  it("serves only the named tools, in the given order, without repeats", async () => {
    const client = await connectClient(["cancel_order", "get_order_status", "cancel_order"]);
    const { tools } = await client.listTools();
    expect(tools.map((listedTool) => listedTool.name)).toEqual([
      "cancel_order",
      "get_order_status",
    ]);
  });

  it.each(["unknown_tool", "constructor", "toString", "__proto__"])(
    "throws at setup for the unknown tool name %s",
    (toolName) => {
      expect(() => toAgentSdkMcpServer(["get_order_status", toolName])).toThrow(
        `Unknown bench tools: ${toolName}`,
      );
    },
  );

  it("answers a tool call with the fake executor outcome", async () => {
    const client = await connectClient();
    const toolArguments = { sku: "MUG-WHT", postalCode: "30301" };
    const callResult = await client.callTool({
      name: "get_stock_availability",
      arguments: toolArguments,
    });
    expect(callResult).toEqual(
      toCallToolResult(executeMockTool("get_stock_availability", toolArguments)),
    );
    expect(callResult.isError).toBe(false);
  });
});

describe("toCallToolResult", () => {
  it("flags failed outcomes as errors", () => {
    const callToolResult = toCallToolResult(executeMockTool("constructor", {}));
    expect(callToolResult.isError).toBe(true);
    expect(callToolResult.content).toEqual([
      {
        type: "text",
        text: JSON.stringify({
          executionStatus: "failed",
          toolName: "constructor",
          errorMessage: "Unknown tool: constructor",
        }),
      },
    ]);
  });
});

describe("toClaudeAgentSdkToolName", () => {
  it("uses the mcp__server__tool form", () => {
    expect(toClaudeAgentSdkToolName("get_order_status")).toBe("mcp__krino-bench__get_order_status");
  });
});
