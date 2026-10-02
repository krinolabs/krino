/** Decisions krino can make. v0.1 ships only these two. */
export type DecisionKind = "toolSelection" | "riskGate";

export type DecisionMode = "off" | "shadow" | "enforce";

/** Tool selection fails open; the risk gate fails closed. */
export type FailureRule = "failOpen" | "failClosed";

export type DecisionStatus =
  | "answered"
  | "timedOut"
  | "failed"
  | "cutOff"
  | "skippedUnsupported"
  | "skippedExploration";

export type DecisionQuestion = {
  decisionKind: DecisionKind;
  questionText: string;
  /** `null` for yes/no questions. */
  options: Array<string> | null;
};

export type DecisionAnswer = {
  choice: string;
  /** 0..1 */
  probability: number;
  decisionModelVersion: string;
  latencyInMilliseconds: number;
};
