import nodePath from "node:path";
import type { ConsumerProject } from "../e2e-context.js";
import { type CommandResult, runCommand } from "../setup/run-command.js";

// Runs things inside a consumer project the way a user would: `node` on the consumer's own files,
// and the installed CLI through `pnpm exec krino`.

/**
 * The parent environment without the variables the outer `pnpm` / `turbo` run sets, so the
 * consumer behaves like a fresh project. `KRINO_TRACE_DIRECTORY` (set by the trace-isolation
 * setup) is kept: nothing writes under the real home folder.
 */
export function consumerEnvironment(
  extraVariables: Readonly<Record<string, string>> = {},
): NodeJS.ProcessEnv {
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(
      ([variableName]) =>
        !/^npm_/i.test(variableName) &&
        !["INIT_CWD", "PNPM_SCRIPT_SRC_DIR", "FORCE_COLOR"].includes(variableName),
    ),
  );
  return { ...environment, NO_COLOR: "1", ...extraVariables };
}

/** Runs one of the consumer's TypeScript files with Node's type stripping. */
export function runConsumerScript(
  consumer: ConsumerProject,
  scriptPath: string,
  scriptArguments: ReadonlyArray<string>,
  extraVariables: Readonly<Record<string, string>> = {},
): Promise<CommandResult> {
  return runCommand(
    process.execPath,
    [
      "--experimental-strip-types",
      "--disable-warning=ExperimentalWarning",
      nodePath.join(consumer.directory, scriptPath),
      ...scriptArguments,
    ],
    {
      workingDirectory: consumer.directory,
      environment: consumerEnvironment(extraVariables),
      isShellCommand: false,
    },
  );
}

/** Runs the `krino` bin the consumer installed from the CLI tarball. */
export function runInstalledKrino(
  consumer: ConsumerProject,
  krinoArguments: ReadonlyArray<string>,
  extraVariables: Readonly<Record<string, string>> = {},
): Promise<CommandResult> {
  return runCommand("pnpm", ["exec", "krino", ...krinoArguments], {
    workingDirectory: consumer.directory,
    environment: consumerEnvironment(extraVariables),
  });
}
