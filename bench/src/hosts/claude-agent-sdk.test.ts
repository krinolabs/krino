import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { MOCK_TOOL_CATALOG } from "../catalog/mock-tool-catalog.js";
import { executeMockTool } from "../executor/execute-mock-tool.js";
import {
  BENCH_MCP_SERVER_NAME,
  type BenchMcpServerOptions,
  createBenchMcpServer,
  toCallToolResult,
  toClaudeAgentSdkToolName,
} from "./claude-agent-sdk.js";

const openClients: Array<Client> = [];

async function connectClient(serverOptions: BenchMcpServerOptions = {}): Promise<Client> {
  const serverConfig = createBenchMcpServer(serverOptions);
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

describe("createBenchMcpServer", () => {
  it("returns an in-process SDK server config", () => {
    const serverConfig = createBenchMcpServer();
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

  it("marks every tool as always loaded by default", async () => {
    const client = await connectClient();
    const { tools } = await client.listTools();
    for (const listedTool of tools) {
      expect(listedTool._meta?.["anthropic/alwaysLoad"], listedTool.name).toBe(true);
    }
  });

  it("lets tools be deferred when alwaysLoad is false", async () => {
    const client = await connectClient({ alwaysLoad: false });
    const { tools } = await client.listTools();
    expect(tools[0]?._meta?.["anthropic/alwaysLoad"]).not.toBe(true);
  });

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
