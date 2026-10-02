import { homedir } from "node:os";
import nodePath from "node:path";
import type { CreateKrino } from "./contracts/index.js";
import { createKrinoRuntime } from "./core/index.js";
import { createFakeDecisionProvider } from "./providers/fake/index.js";
import {
  createFileTraceSink,
  resolveTraceDirectory as resolveTraceDirectoryFromInputs,
} from "./sinks/file/index.js";

export * from "./contracts/index.js";
export { costFromUsage, encodeToolNameChoice } from "./core/index.js";
export { DEFAULT_MODEL_PRICES, findModelPrice } from "./pricing/index.js";
export {
  createFakeDecisionProvider,
  FAKE_DECISION_MODEL_VERSION,
  FAKE_PROVIDER_NAME,
  type FakeAnswer,
  type FakeAnswerFunction,
  type FakeCallOutcome,
  type FakeDecisionProvider,
  type FakeDecisionProviderOptions,
  type FakeErrorInjection,
  type FakeProviderCall,
  type UnscriptedQuestionRule,
} from "./providers/fake/index.js";
export { type RiskCosts, thresholdFromCosts } from "./risk-gate/index.js";
export {
  createFileTraceSink,
  type FileTraceSink,
  type FileTraceSinkOptions,
} from "./sinks/file/index.js";

/** Validates the config, applies defaults and returns the runtime. */
export const createKrino: CreateKrino = (krinoConfig) =>
  createKrinoRuntime(krinoConfig, {
    createDefaultTraceSink: () => createFileTraceSink({ projectName: krinoConfig.projectName }),
    createDefaultDecisionProvider: () => createFakeDecisionProvider(),
  });

/**
 * The absolute folder the default file sink writes `projectName`'s traces to, in the sink's
 * order: `$KRINO_TRACE_DIRECTORY`, else `$XDG_STATE_HOME/krino/traces/<project>` (only when
 * `XDG_STATE_HOME` is absolute), else `~/.krino/traces/<project>`. `<project>` is the project
 * name made safe as a folder name on Windows, macOS and Linux.
 *
 * Reads the environment, home folder and working directory when called. Tools that read traces
 * (the `krino` CLI) use it so they look where the sink writes.
 */
export function resolveTraceDirectory(projectName: string): string {
  return resolveTraceDirectoryFromInputs({
    projectName,
    environment: process.env,
    homeDirectory: homedir(),
    workingDirectory: process.cwd(),
    pathModule: nodePath,
  });
}
