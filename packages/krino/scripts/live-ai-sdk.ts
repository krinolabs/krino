// Live run of the AI SDK adapter: Claude Haiku 4.5 through Vercel AI Gateway, Jev as the
// decision provider. Skipped unless KRINO_LIVE=1. Needs AI_GATEWAY_API_KEY in the environment;
// never prints the key, prompts or tool output. Run from the repository root:
//
//   pnpm turbo run build && KRINO_LIVE=1 node --env-file=<path to .env> \
//     --experimental-strip-types packages/krino/scripts/live-ai-sdk.ts [traceDirectory]
//
// It writes traces to a fresh folder (or the one given), prints each step's usage and the
// sanitized provider metadata shape (cache token keys), then prints `krino report` for the run.

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import nodePath from "node:path";
import { fileURLToPath } from "node:url";
import { createFileTraceSink, createKrino } from "@krinolabs/krino";
import { withKrino } from "@krinolabs/krino/ai-sdk";
import {
  createJevAiGatewayProvider,
  sanitizeJevResponseBody,
} from "@krinolabs/krino/providers/jev";
import { gateway, generateText, jsonSchema, stepCountIs, type ToolSet, tool } from "ai";

const PROJECT_NAME = "wp06-live-haiku-jev";
const MODEL_IDENTIFIER = "anthropic/claude-haiku-4.5";
const DECISION_TIMEOUT_IN_MILLISECONDS = 5000;
const FLUSH_TIMEOUT_IN_MILLISECONDS = 6000;
const CLI_ENTRY = fileURLToPath(new URL("../../cli/dist/index.js", import.meta.url));

type OrderRecord = { status: string };

function createOrderDeskTools(): ToolSet {
  const orders = new Map<string, OrderRecord>([["A-1", { status: "processing" }]]);
  const referenceSchema = jsonSchema<{ reference: string }>({
    type: "object",
    properties: { reference: { type: "string", description: "Order reference, like A-1." } },
    required: ["reference"],
  });
  return {
    searchOrders: tool({
      description: "Searches orders by free text. Use only when the order reference is unknown.",
      inputSchema: jsonSchema<{ query: string }>({
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      }),
      execute: async () => ({ matches: [...orders.keys()] }),
    }),
    getOrder: tool({
      description: "Gets one order by its reference: its status.",
      inputSchema: referenceSchema,
      execute: async ({ reference }) => orders.get(reference) ?? { error: "not found" },
    }),
    cancelOrder: tool({
      description: "Cancels an order that has not shipped yet.",
      inputSchema: referenceSchema,
      execute: async ({ reference }) => {
        const order = orders.get(reference);
        if (order === undefined) {
          return { error: "not found" };
        }
        order.status = "cancelled";
        return { reference, status: order.status };
      },
    }),
    createRefund: tool({
      description:
        "Refunds a paid order to the original payment method. Not needed to cancel an unshipped order.",
      inputSchema: referenceSchema,
      execute: async ({ reference }) => ({ reference, refunded: false }),
    }),
    sendEmail: tool({
      description: "Sends a short notice email to the customer of an order.",
      inputSchema: jsonSchema<{ reference: string; subject: string }>({
        type: "object",
        properties: { reference: { type: "string" }, subject: { type: "string" } },
        required: ["reference", "subject"],
      }),
      execute: async ({ reference }) => ({ reference, sent: true }),
    }),
    lookupCustomer: tool({
      description: "Looks up a customer profile by email. Not needed to email an order's customer.",
      inputSchema: jsonSchema<{ email: string }>({
        type: "object",
        properties: { email: { type: "string" } },
        required: ["email"],
      }),
      execute: async () => ({ tier: "standard" }),
    }),
  };
}

/** Synthetic, neutral policy text (about 6k tokens), so the system prompt can be cached. */
function cacheableSystemText(): string {
  const policyParagraph =
    "Order desk policy: confirm the order reference before any change, cancel only orders " +
    "that have not shipped, never refund an order that was not captured, and always tell the " +
    "customer what changed in one short email. Keep every reply under three sentences.";
  return Array.from(
    { length: 150 },
    (_unused, paragraphIndex) => `${paragraphIndex + 1}. ${policyParagraph}`,
  ).join("\n");
}

function printKrinoReport(traceDirectory: string): void {
  if (!existsSync(CLI_ENTRY)) {
    console.log(`krino CLI is not built; run: krino report --trace-dir ${traceDirectory}`);
    return;
  }
  const reportRun = spawnSync(
    process.execPath,
    [CLI_ENTRY, "report", "--trace-dir", traceDirectory],
    {
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1" },
    },
  );
  console.log(`$ krino report --trace-dir ${traceDirectory}`);
  console.log(reportRun.stdout);
  if (reportRun.status !== 0) {
    console.error(reportRun.stderr);
  }
}

async function main(): Promise<number> {
  if (process.env.KRINO_LIVE !== "1") {
    console.log("live:ai-sdk skipped: set KRINO_LIVE=1 to make live calls to AI Gateway.");
    return 0;
  }
  if ((process.env.AI_GATEWAY_API_KEY ?? "") === "") {
    console.error("live:ai-sdk: KRINO_LIVE=1 but AI_GATEWAY_API_KEY is not set.");
    return 1;
  }
  const traceDirectory =
    process.argv[2] ?? mkdtempSync(nodePath.join(tmpdir(), "krino-live-ai-sdk-"));

  const krino = createKrino({
    projectName: PROJECT_NAME,
    decisionModes: { toolSelection: "shadow", riskGate: "shadow" },
    decisionTimeoutInMilliseconds: DECISION_TIMEOUT_IN_MILLISECONDS,
    riskGatePolicy: {
      blockedToolNames: [],
      alwaysAllowedToolNames: ["searchOrders", "getOrder", "lookupCustomer"],
      allowThresholdByToolName: { cancelOrder: 0.9, createRefund: 0.95, sendEmail: 0.8 },
    },
    decisionProvider: createJevAiGatewayProvider(),
    traceSink: createFileTraceSink({ projectName: PROJECT_NAME, traceDirectory }),
  });

  const observedSteps: Array<Record<string, unknown>> = [];
  const result = await generateText(
    withKrino(
      {
        model: gateway(MODEL_IDENTIFIER),
        tools: createOrderDeskTools(),
        messages: [
          {
            role: "system",
            content: cacheableSystemText(),
            providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
          },
          { role: "user", content: "Please cancel order A-1 and let the customer know by email." },
        ],
        stopWhen: stepCountIs(6),
        onStepEnd: (step) => {
          // Token counts and metadata shape only; free-form strings are redacted.
          observedSteps.push({
            stepNumber: step.stepNumber,
            modelId: step.model.modelId,
            toolCalls: step.toolCalls.map((toolCall) => toolCall.toolName),
            inputTokens: step.usage.inputTokens ?? null,
            inputTokenDetails: step.usage.inputTokenDetails,
            outputTokens: step.usage.outputTokens ?? null,
            sanitized: sanitizeJevResponseBody({
              providerMetadata: step.providerMetadata ?? {},
              usage: step.usage.raw ?? {},
            }),
          });
        },
      },
      krino,
    ),
  );

  console.log(
    `ai-sdk live run: ${result.steps.length} steps, finish reason ${result.finishReason}`,
  );
  console.log(JSON.stringify(observedSteps, null, 2));
  // finishRun runs in the background; give it time, then flush.
  await new Promise((resolve) => setTimeout(resolve, 500));
  await krino.flushAll(FLUSH_TIMEOUT_IN_MILLISECONDS);
  printKrinoReport(traceDirectory);
  return 0;
}

main().then(
  (exitCode) => {
    process.exitCode = exitCode;
  },
  (runError: unknown) => {
    console.error(
      `live:ai-sdk failed: ${runError instanceof Error ? runError.message : String(runError)}`,
    );
    process.exitCode = 1;
  },
);
