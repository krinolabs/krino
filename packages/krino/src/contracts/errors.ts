/** The `KrinoConfig` passed to `createKrino` is invalid. */
export class KrinoConfigurationError extends Error {
  override readonly name = "KrinoConfigurationError";
  /** The config field at fault, when known. */
  readonly configFieldName: string | null;

  constructor(message: string, errorDetails: { configFieldName?: string; cause?: unknown } = {}) {
    super(message, { cause: errorDetails.cause });
    this.configFieldName = errorDetails.configFieldName ?? null;
  }
}

/** A decision provider failed to answer. */
export class DecisionProviderError extends Error {
  override readonly name = "DecisionProviderError";
  readonly providerName: string;

  constructor(message: string, errorDetails: { providerName: string; cause?: unknown }) {
    super(message, { cause: errorDetails.cause });
    this.providerName = errorDetails.providerName;
  }
}

/** A decision provider did not answer within the decision timeout. */
export class DecisionTimeoutError extends Error {
  override readonly name = "DecisionTimeoutError";
  readonly providerName: string;
  readonly timeoutInMilliseconds: number;

  constructor(errorDetails: { providerName: string; timeoutInMilliseconds: number }) {
    super(
      `Decision provider "${errorDetails.providerName}" did not answer within ${errorDetails.timeoutInMilliseconds} ms`,
    );
    this.providerName = errorDetails.providerName;
    this.timeoutInMilliseconds = errorDetails.timeoutInMilliseconds;
  }
}
