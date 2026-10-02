import { waitAtMost } from "./wait-at-most.js";

export type PendingDecision = {
  /** Resolves when the decision settles. Never rejects. */
  settled: Promise<void>;
  /** Stops waiting: the decision is final as `cutOff` and late answers are ignored. */
  cutOff: () => void;
};

export type PendingDecisionTracker = {
  track: (pendingDecision: PendingDecision) => void;
  pendingCount: () => number;
  /** Waits up to the timeout for every tracked decision, then cuts off the rest. */
  settleOrCutOff: (timeoutInMilliseconds: number) => Promise<void>;
};

export function createPendingDecisionTracker(): PendingDecisionTracker {
  const pendingDecisions = new Set<PendingDecision>();

  const track = (pendingDecision: PendingDecision): void => {
    pendingDecisions.add(pendingDecision);
    void pendingDecision.settled.then(() => {
      pendingDecisions.delete(pendingDecision);
    });
  };

  const settleOrCutOff = async (timeoutInMilliseconds: number): Promise<void> => {
    if (pendingDecisions.size === 0) {
      return;
    }
    const waitedDecisions = [...pendingDecisions];
    await waitAtMost(
      timeoutInMilliseconds,
      Promise.all(waitedDecisions.map((pendingDecision) => pendingDecision.settled)),
    );
    for (const pendingDecision of waitedDecisions) {
      if (pendingDecisions.has(pendingDecision)) {
        pendingDecisions.delete(pendingDecision);
        pendingDecision.cutOff();
      }
    }
  };

  return { track, pendingCount: () => pendingDecisions.size, settleOrCutOff };
}
