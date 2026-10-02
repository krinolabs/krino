import { defineConfig } from "vitest/config";

const AREA_THRESHOLDS = { lines: 90, branches: 85 };

export default defineConfig({
  test: {
    passWithNoTests: true,
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text-summary", "json-summary"],
      include: [
        "src/core/**/*.ts",
        "src/risk-gate/**/*.ts",
        "src/providers/**/*.ts",
        "src/sinks/**/*.ts",
      ],
      // Test-only helpers live next to the code; they are not product code.
      exclude: [
        "**/*.test.ts",
        "**/fixtures/**",
        "**/test-support.ts",
        "src/core/local-test-doubles.ts",
        "src/providers/jev-ai-gateway/fixture-fetch.ts",
      ],
      // Each area must meet the bar on its own; a strong area cannot hide a weak one.
      thresholds: {
        "src/core/**": AREA_THRESHOLDS,
        "src/risk-gate/**": AREA_THRESHOLDS,
        "src/providers/**": AREA_THRESHOLDS,
        "src/sinks/**": AREA_THRESHOLDS,
      },
    },
  },
});
