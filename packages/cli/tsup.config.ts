import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm"],
  target: "node22",
  platform: "node",
  dts: {
    // tsup sets baseUrl for the dts pass, which TypeScript 6 reports as deprecated.
    compilerOptions: { ignoreDeprecations: "6.0" },
  },
  clean: true,
});
