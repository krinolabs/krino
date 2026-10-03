import { describe, expect, it } from "vitest";
import { BenchUsageError, parseBenchOptions } from "./bench-options.js";

describe("parseBenchOptions", () => {
  it("defaults to every setup, two repeats, 100 tools, $20, live", () => {
    expect(parseBenchOptions([])).toEqual({
      setupNames: ["baseline", "per-step", "step-zero"],
      runSelection: { selectionKind: "repeats", repeatCount: 2 },
      toolCounts: [100],
      maxSpendInUsd: 20,
      decisionTimeoutInMilliseconds: 800,
      isFake: false,
      traceDirectory: null,
      outputPath: null,
      printJson: false,
      showHelp: false,
    });
  });

  it("reads every option", () => {
    expect(
      parseBenchOptions([
        "--setups",
        "step-zero,baseline",
        "--repeats",
        "1",
        "--tool-counts",
        "10,25,50,100",
        "--max-spend-usd",
        "2.5",
        "--decision-timeout-ms",
        "3000",
        "--fake",
        "--trace-dir",
        "./traces",
        "--out",
        "./result.json",
        "--json",
      ]),
    ).toEqual({
      setupNames: ["baseline", "step-zero"],
      runSelection: { selectionKind: "repeats", repeatCount: 1 },
      toolCounts: [10, 25, 50, 100],
      maxSpendInUsd: 2.5,
      decisionTimeoutInMilliseconds: 3000,
      isFake: true,
      traceDirectory: "./traces",
      outputPath: "./result.json",
      printJson: true,
      showHelp: false,
    });
  });

  it("takes --pilot as the stratified 10-run sample", () => {
    expect(parseBenchOptions(["--pilot"]).runSelection).toEqual({ selectionKind: "pilot" });
  });

  it.each([
    [["--pilot", "--repeats", "2"], "--pilot and --repeats"],
    [["--repeats", "0"], "--repeats"],
    [["--repeats", "1.5"], "--repeats"],
    [["--setups", "per-run"], "--setups"],
    [["--setups", ""], "--setups"],
    [["--setups", "constructor"], "--setups"],
    [["--setups", "__proto__"], "--setups"],
    [["--tool-counts", "30"], "--tool-counts"],
    [["--tool-counts", "toString"], "--tool-counts"],
    [["--max-spend-usd", "-1"], "--max-spend-usd"],
    [["--max-spend-usd", "lots"], "--max-spend-usd"],
    [["--decision-timeout-ms", "0"], "--decision-timeout-ms"],
    [["--decision-timeout-ms", "-5"], "--decision-timeout-ms"],
    [["--decision-timeout-ms", "1.5"], "--decision-timeout-ms"],
    [["--decision-timeout-ms", "soon"], "--decision-timeout-ms"],
    [["--unknown"], "--unknown"],
  ])("rejects %j", (argumentList, messagePart) => {
    expect(() => parseBenchOptions(argumentList)).toThrow(BenchUsageError);
    expect(() => parseBenchOptions(argumentList)).toThrow(messagePart);
  });

  it("orders setups and tool counts canonically and drops repeats", () => {
    const benchOptions = parseBenchOptions([
      "--setups",
      "step-zero,per-step,step-zero",
      "--tool-counts",
      "100,10,10",
    ]);
    expect(benchOptions.setupNames).toEqual(["per-step", "step-zero"]);
    expect(benchOptions.toolCounts).toEqual([10, 100]);
  });
});
