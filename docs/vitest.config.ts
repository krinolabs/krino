import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["../tooling/vitest/trace-isolation.ts"],
    // One TypeScript program over every README block; the first run loads the host SDK types.
    testTimeout: 60_000,
  },
});
