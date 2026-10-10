import type { DecisionKind } from "./decisions.js";

export type HostName = "ai-sdk" | "claude-agent-sdk" | "pi";

export type ToolSelectionTiming = "perStep" | "runStartOnly";

export type HostCapabilities = {
  supportedDecisions: Array<DecisionKind>;
  toolSelectionTiming: ToolSelectionTiming;
  reportsPerStepUsage: boolean;
};

export type ToolDescription = {
  toolName: string;
  toolDescription: string;
};

export type StepContext = {
  runIdentifier: string;
  stepNumber: number;
  /** Redacted before it reaches a sink. */
  taskText: string;
  availableTools: Array<ToolDescription>;
  /** Trimmed to the provider's context budget. */
  recentMessagesText: string;
};

export type PendingToolCall = {
  runIdentifier: string;
  stepNumber: number;
  toolName: string;
  toolArguments: Record<string, unknown>;
};

/** What an adapter passes to `decideModelRoute`, on the first request of a run. */
export type ModelRouteContext = {
  /** Step 0 of the run. */
  stepContext: StepContext;
  /**
   * The model the host uses without krino; shadow mode keeps it. On Pi under `krino/auto`, the
   * policy's fallback model.
   */
  hostModelIdentifier: string;
  /** Policy candidates the host can use now (for example, Pi models with credentials). */
  availableCandidateIdentifiers: Array<string>;
  /**
   * `false` when the host cannot apply a route in this run (Pi: `krino/auto` is not selected).
   * Enforce mode then records `skippedUnsupported`; shadow mode still asks.
   */
  canApplyRoute: boolean;
};
