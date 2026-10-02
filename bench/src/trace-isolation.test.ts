import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

describe("vitest setup", () => {
  it("points KRINO_TRACE_DIRECTORY at a temp folder (tooling/vitest/trace-isolation.ts)", () => {
    const traceDirectory = process.env.KRINO_TRACE_DIRECTORY ?? "";
    expect(traceDirectory.startsWith(tmpdir())).toBe(true);
    expect(traceDirectory).toContain("krino-test-traces-");
  });
});
