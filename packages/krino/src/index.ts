import type { CreateKrino } from "./contracts/index.js";
import { createKrinoRuntime } from "./core/index.js";
import { createFileTraceSink } from "./sinks/file/index.js";

export * from "./contracts/index.js";
export { costFromUsage, encodeToolNameChoice } from "./core/index.js";
export { DEFAULT_MODEL_PRICES, findModelPrice } from "./pricing/index.js";
export {
  createFileTraceSink,
  type FileTraceSink,
  type FileTraceSinkOptions,
} from "./sinks/file/index.js";

/** Validates the config, applies defaults and returns the runtime. The default trace sink is the file sink. */
export const createKrino: CreateKrino = (krinoConfig) =>
  createKrinoRuntime(krinoConfig, {
    createDefaultTraceSink: () => createFileTraceSink({ projectName: krinoConfig.projectName }),
  });
