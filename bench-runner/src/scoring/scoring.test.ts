import { describe, expect, it } from "vitest";
import {
  matchExpectedSequence,
  measureKeptShare,
  type ObservedStep,
  scoreRecallAtNeededStep,
  scoreStepZeroRecall,
} from "./scoring.js";

function step(offeredToolNames: Array<string>, calledToolNames: Array<string> = []): ObservedStep {
  return { offeredToolNames, calledToolNames };
}

describe("scoreStepZeroRecall", () => {
  it("passes when every expected tool is in the step-0 set", () => {
    expect(scoreStepZeroRecall(["a", "b"], [step(["a", "b", "c"])])).toBe(true);
  });

  it("fails when one expected tool is missing", () => {
    expect(scoreStepZeroRecall(["a", "b"], [step(["a", "c"])])).toBe(false);
  });

  it("fails when the run has no step 0", () => {
    expect(scoreStepZeroRecall(["a"], [])).toBe(false);
  });

  it("compares exact names, including prototype names", () => {
    const offered = step(["constructor", "toString"]);
    expect(scoreStepZeroRecall(["constructor", "toString"], [offered])).toBe(true);
    expect(scoreStepZeroRecall(["__proto__"], [offered])).toBe(false);
    expect(scoreStepZeroRecall(["Constructor"], [offered])).toBe(false);
  });
});

describe("scoreRecallAtNeededStep", () => {
  it("passes when each expected tool is called on a step that offered it", () => {
    const steps = [step(["a", "b"], ["a"]), step(["b"], ["b"]), step(["b"])];
    expect(scoreRecallAtNeededStep(["a", "b"], steps)).toBe(true);
  });

  it("checks the step after the previous expected tool when a tool was never called", () => {
    // `b` would be called on step 1, which offers it: a selection pass, whatever the agent did.
    const steps = [step(["a"], ["a"]), step(["a", "b"])];
    expect(scoreRecallAtNeededStep(["a", "b"], steps)).toBe(true);
  });

  it("fails when the step where a tool is needed does not offer it", () => {
    const steps = [step(["a", "b"], ["a"]), step(["a"])];
    expect(scoreRecallAtNeededStep(["a", "b"], steps)).toBe(false);
  });

  it("fails when the run ends before the step where a tool is needed", () => {
    const steps = [step(["a", "b", "c"], ["a"]), step(["a", "b", "c"], ["b"])];
    expect(scoreRecallAtNeededStep(["a", "b", "c"], steps)).toBe(false);
  });

  it("uses the step where the agent called the tool, after extra calls", () => {
    // An extra lookup on step 1; `b` is called on step 2, where it is offered.
    const steps = [step(["a"], ["a"]), step(["x"], ["x"]), step(["b"], ["b"]), step([])];
    expect(scoreRecallAtNeededStep(["a", "b"], steps)).toBe(true);
  });

  it("matches tools called together on one step", () => {
    const steps = [step(["a", "b"], ["a", "b"]), step([])];
    expect(scoreRecallAtNeededStep(["a", "b"], steps)).toBe(true);
  });

  it("equals step-0 recall when the tool list never changes and the agent calls every tool", () => {
    const offered = ["a", "b", "c"];
    const steps = [step(offered, ["a"]), step(offered, ["b"]), step(offered)];
    expect(scoreRecallAtNeededStep(["a", "b"], steps)).toBe(scoreStepZeroRecall(["a", "b"], steps));
  });

  it("fails with no steps", () => {
    expect(scoreRecallAtNeededStep(["a"], [])).toBe(false);
  });

  it("does not treat prototype names as offered", () => {
    expect(scoreRecallAtNeededStep(["__proto__"], [step(["a"])])).toBe(false);
    expect(scoreRecallAtNeededStep(["constructor"], [step(["constructor"], ["constructor"])])).toBe(
      true,
    );
  });
});

describe("measureKeptShare", () => {
  it("is the step-0 set over the tools available", () => {
    expect(measureKeptShare([step(["a", "b"]), step(["a"])], 10)).toEqual({
      keptCount: 2,
      keptShare: 0.2,
    });
  });

  it("counts repeated names once", () => {
    expect(measureKeptShare([step(["a", "a"])], 4)).toEqual({ keptCount: 1, keptShare: 0.25 });
  });

  it("is zero kept when there is no step 0", () => {
    expect(measureKeptShare([], 10)).toEqual({ keptCount: 0, keptShare: 0 });
  });
});

describe("matchExpectedSequence", () => {
  it("matches an ordered subsequence and counts the calls in between as extra", () => {
    expect(matchExpectedSequence(["a", "b"], ["a", "x", "b"])).toEqual({
      isMatched: true,
      matchedCount: 2,
      extraCallCount: 1,
    });
  });

  it("does not match out of order", () => {
    expect(matchExpectedSequence(["a", "b"], ["b", "a"])).toEqual({
      isMatched: false,
      matchedCount: 1,
      extraCallCount: 1,
    });
  });

  it("counts a repeated expected call as extra", () => {
    expect(matchExpectedSequence(["a", "b"], ["a", "a", "b"])).toEqual({
      isMatched: true,
      matchedCount: 2,
      extraCallCount: 1,
    });
  });

  it("counts every unmatched call when the sequence is incomplete", () => {
    expect(matchExpectedSequence(["a", "b", "c"], ["a", "x"])).toEqual({
      isMatched: false,
      matchedCount: 1,
      extraCallCount: 1,
    });
  });
});
