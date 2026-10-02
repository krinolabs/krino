import type { AgentStepTrace, RunSummaryTrace } from "./trace.js";

export type TraceSink = {
  writeRecord: (traceRecord: AgentStepTrace | RunSummaryTrace) => void;
  flush: (timeoutInMilliseconds: number) => Promise<void>;
};
