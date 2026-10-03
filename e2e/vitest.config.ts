import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["../tooling/vitest/trace-isolation.ts"],
    // Packs both packages and installs the consumer projects once, before any test file runs.
    globalSetup: ["./src/setup/global-setup.ts"],
    // The tests start child processes: node, tsc and the installed `krino` CLI.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
