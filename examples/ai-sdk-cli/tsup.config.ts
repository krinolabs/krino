import { defineConfig } from "tsup";

export default defineConfig({
  entry: { main: "src/main.ts", agent: "src/agent.ts" },
  format: ["esm"],
  target: "node22",
  platform: "node",
  dts: {
    entry: { agent: "src/agent.ts" },
    // tsup sets baseUrl for the dts pass, which TypeScript 6 reports as deprecated.
    compilerOptions: { ignoreDeprecations: "6.0" },
  },
  clean: true,
});
