import type { DecisionKind } from "./decisions.js";

export type HostName = "ai-sdk" | "claude-agent-sdk";

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
