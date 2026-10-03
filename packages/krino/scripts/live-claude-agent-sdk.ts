// Live run for the Claude Agent SDK adapter (WP-07): one real Agent SDK run on Haiku, with Jev
// (through Vercel AI Gateway) as the decision provider, in shadow mode. Then `krino report`.
// Skipped unless KRINO_LIVE=1. Reads keys from the environment only; never prints them.
//
// Needs AI_GATEWAY_API_KEY (Jev). The Agent SDK uses ANTHROPIC_API_KEY, else the Claude CLI login.
// From the repository root (builds krino, bench and the CLI, then runs):
//
//   pnpm turbo run build --filter=@krinolabs/bench --filter=@krinolabs/cli && KRINO_LIVE=1 node --env-file=../krino/.env --experimental-strip-types packages/krino/scripts/live-claude-agent-sdk.ts [trace folder]
//
// The agent sees only six mock tools from the bench MCP server. Built-in tools (Bash, file edits)
// are disabled, user settings are not loaded, and the run stops after 6 turns.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import nodePath from "node:path";
import { fileURLToPath } from "node:url";
import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { createFileTraceSink, createKrino } from "@krinolabs/krino";
import { krinoAgentOptions, observeKrinoMessages } from "@krinolabs/krino/claude-agent-sdk";
import {
  createJevAiGatewayProvider,
  type JevEvaluationReport,
} from "@krinolabs/krino/providers/jev";

const PROJECT_NAME = "wp07-live-claude-agent-sdk";
const AGENT_MODEL = "claude-haiku-4-5";
const MAXIMUM_TURNS = 6;
const FLUSH_TIMEOUT_IN_MILLISECONDS = 5_000;
const BENCH_TOOL_NAMES = [
  "cancel_order",
  "get_order_details",
  "add_order_note",
  "list_order_refunds",
  "approve_refund",
  "get_shipping_rates",
];
const SECRET_ENVIRONMENT_NAMES = ["AI_GATEWAY_API_KEY", "ANTHROPIC_API_KEY"];

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const builtFiles = {
  bench: nodePath.join(repositoryRoot, "bench/dist/index.js"),
  benchClaudeAgentSdk: nodePath.join(repositoryRoot, "bench/dist/hosts/claude-agent-sdk.js"),
  adapter: nodePath.join(repositoryRoot, "packages/krino/dist/adapters/claude-agent-sdk/index.js"),
  cli: nodePath.join(repositoryRoot, "packages/cli/dist/index.js"),
};

type EvaluationShape = Omit<JevEvaluationReport, "responseBody">;

type ResultShape = {
  subtype: string;
  numTurns: number;
  totalCostInUsd: number;
  usage: unknown;
  modelUsage: unknown;
};

/** Replaces anything that looks like a key or a token before it is printed or saved. */
function redactKeyLikeText(jsonText: string): string {
  return jsonText
    .replace(/(sk-[A-Za-z0-9_-]{6,}|vck_[A-Za-z0-9_-]{6,})/g, "[redacted]")
    .replace(/"([^"]*(?:key|token|secret|authorization)[^"]*)":\s*"[^"]*"/gi, '"$1": "[redacted]"');
}

/** The environment without keys, for child processes that do not need them. */
function environmentWithoutSecrets(): NodeJS.ProcessEnv {
  const childEnvironment = { ...process.env };
  for (const secretName of SECRET_ENVIRONMENT_NAMES) {
    delete childEnvironment[secretName];
  }
  return childEnvironment;
}

async function main(): Promise<number> {
  if (process.env.KRINO_LIVE !== "1") {
    console.log("live:claude-agent-sdk skipped: set KRINO_LIVE=1 to make live calls.");
    return 0;
  }
  if ((process.env.AI_GATEWAY_API_KEY ?? "") === "") {
    console.error("live:claude-agent-sdk: KRINO_LIVE=1 but AI_GATEWAY_API_KEY is not set.");
    return 1;
  }
  if ((process.env.ANTHROPIC_API_KEY ?? "") === "") {
    console.log("ANTHROPIC_API_KEY is not set; the Agent SDK will use the Claude CLI login.");
  }
  const missingBuilds = Object.values(builtFiles).filter((builtFile) => !existsSync(builtFile));
  if (missingBuilds.length > 0) {
    console.error(
      "live:claude-agent-sdk: build first: " +
        "pnpm turbo run build --filter=@krinolabs/bench --filter=@krinolabs/cli",
    );
    return 1;
  }

  // Bench depends on krino, so krino cannot depend on bench: load its build output by path.
  const bench: typeof import("../../../bench/dist/index.js") = await import(
    "../../../bench/dist/index.js"
  );
  const benchHost: typeof import("../../../bench/dist/hosts/claude-agent-sdk.js") = await import(
    "../../../bench/dist/hosts/claude-agent-sdk.js"
  );

  const traceDirectory =
    process.argv[2] ?? mkdtempSync(nodePath.join(tmpdir(), "krino-live-claude-agent-sdk-"));
  const benchTask = bench.BENCH_TASKS[0];
  if (benchTask === undefined) {
    console.error("live:claude-agent-sdk: the bench task set is empty.");
    return 1;
  }
  const toolDescriptions = bench
    .toToolDescriptions(
      bench.MOCK_TOOL_CATALOG.filter((toolDefinition) =>
        BENCH_TOOL_NAMES.includes(toolDefinition.toolName),
      ),
    )
    .map((toolDescription) => ({
      ...toolDescription,
      toolName: benchHost.toClaudeAgentSdkToolName(toolDescription.toolName),
    }));

  const evaluationShapes: Array<EvaluationShape> = [];
  const krino = createKrino({
    projectName: PROJECT_NAME,
    decisionModes: { toolSelection: "shadow", riskGate: "shadow" },
    decisionProvider: createJevAiGatewayProvider({
      // Keep the shape of what AI Gateway reports; never the raw body.
      onEvaluationReport: ({ responseBody: _responseBody, ...evaluationShape }) => {
        evaluationShapes.push(evaluationShape);
      },
    }),
    traceSink: createFileTraceSink({ projectName: PROJECT_NAME, traceDirectory }),
    riskGatePolicy: {
      blockedToolNames: [],
      alwaysAllowedToolNames: [benchHost.toClaudeAgentSdkToolName("get_order_details")],
      allowThresholdByToolName: { [benchHost.toClaudeAgentSdkToolName("cancel_order")]: 0.9 },
    },
  });

  const krinoRun = await krinoAgentOptions(
    {
      model: AGENT_MODEL,
      mcpServers: {
        [benchHost.BENCH_MCP_SERVER_NAME]: benchHost.toAgentSdkMcpServer(BENCH_TOOL_NAMES),
      },
      tools: [],
      allowedTools: toolDescriptions.map((toolDescription) => toolDescription.toolName),
      settingSources: [],
      persistSession: false,
      maxTurns: MAXIMUM_TURNS,
      cwd: tmpdir(),
    },
    krino,
    benchTask.taskText,
    { toolDescriptions },
  );

  console.log(`task: ${benchTask.taskText}`);
  let resultShape: ResultShape | null = null;
  const messages: AsyncIterable<SDKMessage> = query({
    prompt: benchTask.taskText,
    options: krinoRun.queryOptions,
  });
  for await (const message of observeKrinoMessages(messages, krinoRun)) {
    if (message.type === "assistant") {
      for (const contentBlock of message.message.content) {
        if (contentBlock.type === "tool_use") {
          console.log(`tool call: ${contentBlock.name}`);
        }
      }
    }
    if (message.type === "result") {
      resultShape = {
        subtype: message.subtype,
        numTurns: message.num_turns,
        totalCostInUsd: message.total_cost_usd,
        usage: message.usage,
        modelUsage: message.modelUsage,
      };
    }
  }
  await krino.flushAll(FLUSH_TIMEOUT_IN_MILLISECONDS);
  console.log(`run ${krinoRun.runHandle.runIdentifier}: ${resultShape?.subtype ?? "no result"}`);

  const shapesText = redactKeyLikeText(
    JSON.stringify({ agentSdkResult: resultShape, jevEvaluations: evaluationShapes }, null, 2),
  );
  const shapesFile = `${traceDirectory}-usage-shapes.json`;
  writeFileSync(shapesFile, shapesText);
  console.log(`\nusage shapes (also in ${shapesFile}):\n${shapesText}\n`);

  const reportText = execFileSync(
    process.execPath,
    [builtFiles.cli, "report", "--trace-dir", traceDirectory],
    { encoding: "utf8", env: environmentWithoutSecrets() },
  );
  console.log(redactKeyLikeText(reportText));
  return resultShape === null ? 1 : 0;
}

main().then(
  (exitCode) => {
    process.exitCode = exitCode;
  },
  (unexpectedError: unknown) => {
    const errorText = unexpectedError instanceof Error ? unexpectedError.message : "unknown error";
    console.error(`live:claude-agent-sdk failed: ${redactKeyLikeText(errorText)}`);
    process.exitCode = 1;
  },
);
