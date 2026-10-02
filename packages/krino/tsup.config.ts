import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "adapters/ai-sdk/index": "src/adapters/ai-sdk/index.ts",
    "adapters/claude-agent-sdk/index": "src/adapters/claude-agent-sdk/index.ts",
    "providers/jev-ai-gateway/index": "src/providers/jev-ai-gateway/index.ts",
  },
  format: ["esm"],
  target: "node22",
  platform: "node",
  dts: {
    // tsup sets baseUrl for the dts pass, which TypeScript 6 reports as deprecated.
    compilerOptions: { ignoreDeprecations: "6.0" },
  },
  clean: true,
  splitting: true,
  treeshake: true,
  external: ["ai", "@anthropic-ai/claude-agent-sdk"],
});
