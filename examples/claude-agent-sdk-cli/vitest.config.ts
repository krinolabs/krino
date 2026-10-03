import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["../../tooling/vitest/trace-isolation.ts"],
    // The CLI tests start child processes.
    testTimeout: 30_000,
  },
});
