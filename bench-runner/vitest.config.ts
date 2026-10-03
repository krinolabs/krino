import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["../tooling/vitest/trace-isolation.ts"],
    // The bin tests start child processes, and the report engine starts DuckDB.
    testTimeout: 60_000,
  },
});
