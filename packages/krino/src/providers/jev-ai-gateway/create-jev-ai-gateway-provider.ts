import { createGateway, experimental_evaluate } from "ai";
import type {
  DecisionAnswer,
  DecisionProvider,
  DecisionQuestion,
  DecisionRequestOptions,
  StepContext,
} from "../../contracts/index.js";
import { DecisionProviderError, DecisionTimeoutError } from "../../contracts/index.js";
import {
  buildJevEvaluationRequest,
  decisionAnswersFromJev,
  type JevAnswer,
  type JevEvaluationRequest,
} from "./jev-questions.js";

export const JEV_MODEL_IDENTIFIER = "typesafe-ai/jev";
export const AI_GATEWAY_API_KEY_VARIABLE = "AI_GATEWAY_API_KEY";

/** What AI Gateway reported for one evaluation. Never holds the request state or the key. */
export type JevEvaluationReport = {
  /** `model` from the response, else the requested model identifier. */
  decisionModelVersion: string;
  latencyInMilliseconds: number;
  questionCount: number;
  inputTokens: number | null;
  outputTokens: number | null;
  /** As AI Gateway sent it (for example `gateway.cost`). The shape is not guaranteed. */
  providerMetadata: Readonly<Record<string, Readonly<Record<string, unknown>>>> | null;
  /** The raw response body. Run it through `sanitizeJevResponseBody` before saving it. */
  responseBody: unknown;
};

export type JevAiGatewayProviderOptions = {
  /** Default: `AI_GATEWAY_API_KEY`, read on every call. Never logged. */
  apiKey?: string;
  /** Default `typesafe-ai/jev`. Also the provider name, which the runtime uses for pricing. */
  modelIdentifier?: string;
  /** Retries for transient failures. Default 0: a decision has a short deadline. */
  maxRetries?: number;
  /** Default: the AI SDK default (`https://ai-gateway.vercel.sh/v4/ai`). */
  baseUrl?: string;
  /** Replaces `fetch`. Used by tests to serve recorded fixtures. */
  fetch?: typeof globalThis.fetch;
  /** Called after each answered evaluation, e.g. to record usage and cost. Errors are ignored. */
  onEvaluationReport?: (evaluationReport: JevEvaluationReport) => void;
  /** Where the API key is read from. Default `process.env`. */
  environment?: Readonly<Record<string, string | undefined>>;
  /** Default `performance.now`. */
  monotonicTime?: () => number;
};

type GatewayProvider = ReturnType<typeof createGateway>;

type ErrorSummary = {
  errorName: string;
  errorMessage: string;
  statusCode: number | null;
};

function errorSummary(failureCause: unknown): ErrorSummary {
  if (!(failureCause instanceof Error)) {
    return { errorName: "UnknownError", errorMessage: String(failureCause), statusCode: null };
  }
  const statusCode: unknown = Reflect.get(failureCause, "statusCode");
  return {
    errorName: failureCause.name,
    errorMessage: failureCause.message,
    statusCode: typeof statusCode === "number" ? statusCode : null,
  };
}

/**
 * Wraps a failure without the original error: AI SDK errors carry the request body,
 * which holds unredacted task text. Only the name, message and status code are kept.
 */
function providerErrorFrom(providerName: string, failureCause: unknown): DecisionProviderError {
  const summary = errorSummary(failureCause);
  const statusText = summary.statusCode === null ? "" : ` (HTTP ${summary.statusCode})`;
  return new DecisionProviderError(
    `Jev request failed${statusText}: ${summary.errorName}: ${summary.errorMessage}`,
    { providerName, cause: summary },
  );
}

/**
 * A `DecisionProvider` that asks TypeSafe AI's Jev through Vercel AI Gateway with
 * `experimental_evaluate`. All questions go in one request against one shared state.
 */
export function createJevAiGatewayProvider(
  jevOptions: JevAiGatewayProviderOptions = {},
): DecisionProvider {
  const modelIdentifier = jevOptions.modelIdentifier ?? JEV_MODEL_IDENTIFIER;
  // Named after the model: the runtime prices a request that got no answer by provider name.
  const providerName = modelIdentifier;
  const monotonicTime = jevOptions.monotonicTime ?? (() => performance.now());
  let cachedGateway: { apiKey: string; gatewayProvider: GatewayProvider } | null = null;

  const gatewayFor = (apiKey: string): GatewayProvider => {
    if (cachedGateway === null || cachedGateway.apiKey !== apiKey) {
      cachedGateway = {
        apiKey,
        gatewayProvider: createGateway({
          apiKey,
          ...(jevOptions.baseUrl === undefined ? {} : { baseURL: jevOptions.baseUrl }),
          ...(jevOptions.fetch === undefined ? {} : { fetch: jevOptions.fetch }),
        }),
      };
    }
    return cachedGateway.gatewayProvider;
  };

  const resolveApiKey = (): string | null => {
    const environment = jevOptions.environment ?? process.env;
    const apiKey = jevOptions.apiKey ?? environment[AI_GATEWAY_API_KEY_VARIABLE] ?? "";
    return apiKey.trim() === "" ? null : apiKey;
  };

  const reportEvaluation = (evaluationReport: JevEvaluationReport): void => {
    try {
      jevOptions.onEvaluationReport?.(evaluationReport);
    } catch {
      // A reporting callback must never fail the decision.
    }
  };

  const askDecisionQuestions = async (
    decisionQuestions: Array<DecisionQuestion>,
    stepContext: StepContext,
    requestOptions: DecisionRequestOptions,
  ): Promise<Array<DecisionAnswer>> => {
    if (decisionQuestions.length === 0) {
      return [];
    }
    const apiKey = resolveApiKey();
    if (apiKey === null) {
      throw new DecisionProviderError(`${AI_GATEWAY_API_KEY_VARIABLE} is not set`, {
        providerName,
      });
    }
    let evaluationRequest: JevEvaluationRequest;
    try {
      evaluationRequest = buildJevEvaluationRequest(decisionQuestions, stepContext);
    } catch (mappingError) {
      throw providerErrorFrom(providerName, mappingError);
    }

    const callerSignal = requestOptions.abortSignal;
    if (callerSignal.aborted) {
      throw new DecisionProviderError("Jev request was aborted before it started", {
        providerName,
      });
    }
    const timeoutController = new AbortController();
    const timeoutHandle = setTimeout(() => {
      timeoutController.abort();
    }, requestOptions.timeoutInMilliseconds);
    const startedAt = monotonicTime();

    try {
      const evaluationResult = await experimental_evaluate({
        model: gatewayFor(apiKey).evaluationModel(modelIdentifier),
        state: evaluationRequest.state,
        questions: evaluationRequest.questions,
        maxRetries: jevOptions.maxRetries ?? 0,
        // Aborting this signal cancels the HTTP request, not only the wait for it.
        abortSignal: AbortSignal.any([callerSignal, timeoutController.signal]),
        // Host telemetry would record the unredacted state.
        telemetry: { isEnabled: false },
      });
      const latencyInMilliseconds = Math.max(0, Math.round(monotonicTime() - startedAt));
      const decisionModelVersion = evaluationResult.response.modelId;
      const jevAnswers: Readonly<Record<string, JevAnswer>> = evaluationResult.answers;
      const decisionAnswers = decisionAnswersFromJev(decisionQuestions, jevAnswers, {
        decisionModelVersion,
        latencyInMilliseconds,
      });
      reportEvaluation({
        decisionModelVersion,
        latencyInMilliseconds,
        questionCount: decisionQuestions.length,
        inputTokens: evaluationResult.usage.inputTokens ?? null,
        outputTokens: evaluationResult.usage.outputTokens ?? null,
        providerMetadata: evaluationResult.providerMetadata ?? null,
        responseBody: evaluationResult.response.body,
      });
      return decisionAnswers;
    } catch (failureCause) {
      if (callerSignal.aborted) {
        throw new DecisionProviderError("Jev request was aborted", { providerName });
      }
      if (timeoutController.signal.aborted) {
        throw new DecisionTimeoutError({
          providerName,
          timeoutInMilliseconds: requestOptions.timeoutInMilliseconds,
        });
      }
      throw providerErrorFrom(providerName, failureCause);
    } finally {
      clearTimeout(timeoutHandle);
    }
  };

  return { providerName, askDecisionQuestions };
}
