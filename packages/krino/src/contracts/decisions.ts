/** Decisions krino can make. v0.2 adds `modelRouting`. */
export type DecisionKind = "toolSelection" | "riskGate" | "modelRouting";

export type DecisionMode = "off" | "shadow" | "enforce";

/** Tool selection and model routing fail open; the risk gate fails closed. */
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
  /**
   * One line per option, in the order of `options`: what choosing it means. Choice questions
   * only; providers send it as the option's criteria. Absent: the option text is its own criteria.
   */
  optionCriteria?: Array<string>;
};

export type DecisionAnswer = {
  choice: string;
  /** 0..1 */
  probability: number;
  decisionModelVersion: string;
  latencyInMilliseconds: number;
};
