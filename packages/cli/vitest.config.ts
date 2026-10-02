import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    passWithNoTests: true,
    setupFiles: ["../../tooling/vitest/trace-isolation.ts"],
  },
});
