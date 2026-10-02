import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import nodePath from "node:path";
import { afterAll } from "vitest";

// Vitest setup file. Every package with tests lists it in `setupFiles`.
// Vitest runs setup files once per test file, so each test file gets its own trace folder,
// and no test writes traces under the real home folder (~/.krino).

const TRACE_DIRECTORY_ENVIRONMENT_VARIABLE = "KRINO_TRACE_DIRECTORY";

const isolatedTraceDirectory = mkdtempSync(nodePath.join(tmpdir(), "krino-test-traces-"));

// Set directly, not with `vi.stubEnv`: a test that calls `vi.unstubAllEnvs()` then falls back to
// this folder instead of the real environment.
process.env[TRACE_DIRECTORY_ENVIRONMENT_VARIABLE] = isolatedTraceDirectory;

afterAll(() => {
  rmSync(isolatedTraceDirectory, { recursive: true, force: true, maxRetries: 5 });
});
