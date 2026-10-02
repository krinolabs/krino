import { homedir, tmpdir } from "node:os";
import nodePath from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFileTraceSink, resolveTraceDirectory } from "./index.js";

describe("resolveTraceDirectory", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is the folder the default file sink writes to", () => {
    expect(resolveTraceDirectory("shop")).toBe(
      createFileTraceSink({ projectName: "shop" }).traceDirectory,
    );
  });

  it("uses $KRINO_TRACE_DIRECTORY first, resolved against the working directory", () => {
    vi.stubEnv("KRINO_TRACE_DIRECTORY", "relative-traces");
    expect(resolveTraceDirectory("shop")).toBe(nodePath.resolve("relative-traces"));
  });

  it("uses an absolute $XDG_STATE_HOME, else the home folder, with a safe project folder", () => {
    vi.stubEnv("KRINO_TRACE_DIRECTORY", "");
    const stateHome = nodePath.join(tmpdir(), "krino-state");
    vi.stubEnv("XDG_STATE_HOME", stateHome);
    expect(resolveTraceDirectory("a/b")).toBe(nodePath.join(stateHome, "krino", "traces", "a-b"));
    vi.stubEnv("XDG_STATE_HOME", "");
    expect(resolveTraceDirectory("shop")).toBe(
      nodePath.join(homedir(), ".krino", "traces", "shop"),
    );
  });
});
