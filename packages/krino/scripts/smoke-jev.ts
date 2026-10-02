// Live smoke test for the Jev provider through Vercel AI Gateway.
// Skipped unless KRINO_LIVE=1. Needs AI_GATEWAY_API_KEY. Never prints the key or the state.
//
//   KRINO_LIVE=1 pnpm --filter @krinolabs/krino smoke:jev
//   KRINO_LIVE=1 KRINO_RECORD_FIXTURES=1 pnpm --filter @krinolabs/krino smoke:jev
//
// 1. One live call (3 tool-selection questions): latency, model version, usage, cost.
// 2. Billing check: 1 question, then 20 questions, on the same shared context.
//    Says whether the shared context is billed once per request or once per question.

import { writeFileSync } from "node:fs";
import type { DecisionQuestion, StepContext } from "@krinolabs/krino";
import {
  createJevAiGatewayProvider,
  type JevEvaluationReport,
  sanitizeJevResponseBody,
} from "@krinolabs/krino/providers/jev";
import { createGateway } from "ai";

const SMOKE_TIMEOUT_IN_MILLISECONDS = 30_000;
const BILLING_QUESTION_COUNT = 20;
const FIXTURE_DIRECTORY = new URL("../src/providers/jev-ai-gateway/fixtures/", import.meta.url);

type BillingSample = {
  label: string;
  questionCount: number;
  inputTokens: number | null;
  outputTokens: number | null;
  costInUsd: number | null;
  generationCostInUsd: number | null;
  generationPromptTokens: number | null;
  latencyInMilliseconds: number;
};

function smokeStepContext(): StepContext {
  // About 2,000 tokens of neutral, synthetic context, so per-question billing would show clearly.
  const availableTools = Array.from({ length: 40 }, (_unused, toolIndex) => ({
    toolName: `tool${toolIndex}`,
    toolDescription:
      `Synthetic tool number ${toolIndex} for the krino smoke test. It looks up an inventory ` +
      `record by its identifier, returns the stock level, the warehouse code and the date of ` +
      `the last count, and never changes any data.`,
  }));
  return {
    runIdentifier: "krino-smoke",
    stepNumber: 0,
    taskText: "Find how many units of item 4411 are in stock and in which warehouse.",
    availableTools,
    recentMessagesText: "user: how many of item 4411 do we have, and where?",
  };
}

function toolQuestions(stepContext: StepContext, questionCount: number): Array<DecisionQuestion> {
  return stepContext.availableTools.slice(0, questionCount).map((toolDescription) => ({
    decisionKind: "toolSelection",
    questionText: `Does the agent need the tool "${toolDescription.toolName}" to complete this task?`,
    options: null,
  }));
}

function numberOrNull(value: unknown): number | null {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
}

function gatewayMetadata(evaluationReport: JevEvaluationReport): Readonly<Record<string, unknown>> {
  return evaluationReport.providerMetadata?.gateway ?? {};
}

async function generationInfo(
  apiKey: string,
  evaluationReport: JevEvaluationReport,
): Promise<{ costInUsd: number | null; promptTokens: number | null }> {
  const generationId = gatewayMetadata(evaluationReport).generationId;
  if (typeof generationId !== "string") {
    return { costInUsd: null, promptTokens: null };
  }
  const gatewayProvider = createGateway({ apiKey });
  // Generation info can lag behind the response for a few seconds.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const info = await gatewayProvider.getGenerationInfo({ id: generationId });
      return { costInUsd: info.totalCost, promptTokens: info.promptTokens };
    } catch {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 2_000));
    }
  }
  return { costInUsd: null, promptTokens: null };
}

async function askOnce(
  apiKey: string,
  label: string,
  stepContext: StepContext,
  decisionQuestions: Array<DecisionQuestion>,
): Promise<{ sample: BillingSample; evaluationReport: JevEvaluationReport }> {
  const evaluationReports: Array<JevEvaluationReport> = [];
  const jevProvider = createJevAiGatewayProvider({
    apiKey,
    onEvaluationReport: (evaluationReport) => {
      evaluationReports.push(evaluationReport);
    },
  });
  const decisionAnswers = await jevProvider.askDecisionQuestions(decisionQuestions, stepContext, {
    timeoutInMilliseconds: SMOKE_TIMEOUT_IN_MILLISECONDS,
    abortSignal: new AbortController().signal,
  });
  const evaluationReport = evaluationReports.at(-1);
  if (evaluationReport === undefined) {
    throw new Error(`${label}: answered without an evaluation report`);
  }
  const answerSummary = decisionAnswers
    .slice(0, 5)
    .map((answer) => `${answer.choice}@${answer.probability.toFixed(3)}`)
    .join(" ");
  console.log(`  ${label}: ${decisionAnswers.length} answers (first: ${answerSummary})`);
  const metadata = gatewayMetadata(evaluationReport);
  const info = await generationInfo(apiKey, evaluationReport);
  return {
    evaluationReport,
    sample: {
      label,
      questionCount: decisionQuestions.length,
      inputTokens: evaluationReport.inputTokens,
      outputTokens: evaluationReport.outputTokens,
      costInUsd: numberOrNull(metadata.cost),
      generationCostInUsd: info.costInUsd,
      generationPromptTokens: info.promptTokens,
      latencyInMilliseconds: evaluationReport.latencyInMilliseconds,
    },
  };
}

function printReport(evaluationReport: JevEvaluationReport): void {
  console.log(`  latency:        ${evaluationReport.latencyInMilliseconds} ms`);
  console.log(`  model version:  ${evaluationReport.decisionModelVersion}`);
  console.log(
    `  usage:          input ${evaluationReport.inputTokens ?? "?"} / output ${evaluationReport.outputTokens ?? "?"} tokens`,
  );
  const sanitizedBody = sanitizeJevResponseBody({
    providerMetadata: evaluationReport.providerMetadata ?? {},
  });
  console.log(`  provider metadata (sanitized): ${JSON.stringify(sanitizedBody)}`);
}

function billingVerdict(oneQuestion: BillingSample, manyQuestions: BillingSample): string {
  const measure = (sample: BillingSample): number | null =>
    sample.inputTokens ?? sample.generationPromptTokens ?? sample.costInUsd;
  const oneMeasure = measure(oneQuestion);
  const manyMeasure = measure(manyQuestions);
  if (oneMeasure === null || manyMeasure === null || oneMeasure <= 0) {
    return "UNKNOWN: AI Gateway reported neither tokens nor cost; check the dashboard by hand.";
  }
  const extraQuestions = manyQuestions.questionCount - oneQuestion.questionCount;
  const ratio = manyMeasure / oneMeasure;
  const perExtraQuestionShare = (manyMeasure - oneMeasure) / extraQuestions / oneMeasure;
  // Billed per question: each extra question costs about as much as the whole first request.
  if (perExtraQuestionShare > 0.5) {
    return `ONCE PER QUESTION: ${manyQuestions.questionCount} questions cost ${ratio.toFixed(2)}x one question.`;
  }
  return `ONCE PER REQUEST: ${manyQuestions.questionCount} questions cost ${ratio.toFixed(2)}x one question (each extra question adds ${(perExtraQuestionShare * 100).toFixed(1)}% of a one-question request).`;
}

function recordFixture(fileName: string, evaluationReport: JevEvaluationReport): void {
  const fixture = {
    source: `recorded ${new Date().toISOString().slice(0, 10)} with ai 7.0.126`,
    status: 200,
    body: sanitizeJevResponseBody(evaluationReport.responseBody),
  };
  writeFileSync(new URL(fileName, FIXTURE_DIRECTORY), `${JSON.stringify(fixture, null, 2)}\n`);
  console.log(`  wrote fixture ${fileName} (review the diff before committing)`);
}

async function main(): Promise<number> {
  if (process.env.KRINO_LIVE !== "1") {
    console.log("smoke:jev skipped: set KRINO_LIVE=1 to make live calls to AI Gateway.");
    return 0;
  }
  const apiKey = process.env.AI_GATEWAY_API_KEY ?? "";
  if (apiKey.trim() === "") {
    console.error("smoke:jev: KRINO_LIVE=1 but AI_GATEWAY_API_KEY is not set.");
    return 1;
  }
  const stepContext = smokeStepContext();

  console.log("1. One live call (3 tool-selection questions)");
  const single = await askOnce(apiKey, "3 questions", stepContext, toolQuestions(stepContext, 3));
  printReport(single.evaluationReport);

  console.log(`\n2. Billing check: 1 question, then ${BILLING_QUESTION_COUNT}, same context`);
  const oneQuestion = await askOnce(
    apiKey,
    "1 question",
    stepContext,
    toolQuestions(stepContext, 1),
  );
  const manyQuestions = await askOnce(
    apiKey,
    `${BILLING_QUESTION_COUNT} questions`,
    stepContext,
    toolQuestions(stepContext, BILLING_QUESTION_COUNT),
  );
  console.table([oneQuestion.sample, manyQuestions.sample]);
  console.log(
    `  verdict: shared context billed ${billingVerdict(oneQuestion.sample, manyQuestions.sample)}`,
  );

  if (process.env.KRINO_RECORD_FIXTURES === "1") {
    console.log("\n3. Recording sanitized fixtures");
    recordFixture("recorded-three-questions.json", single.evaluationReport);
    recordFixture("recorded-twenty-questions.json", manyQuestions.evaluationReport);
  }
  return 0;
}

main().then(
  (exitCode) => {
    process.exitCode = exitCode;
  },
  (smokeError: unknown) => {
    // Error messages from the provider never contain the key (see the provider tests).
    console.error(
      `smoke:jev failed: ${smokeError instanceof Error ? smokeError.message : String(smokeError)}`,
    );
    process.exitCode = 1;
  },
);
