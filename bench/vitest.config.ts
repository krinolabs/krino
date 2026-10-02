import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["../tooling/vitest/trace-isolation.ts"],
  },
});
