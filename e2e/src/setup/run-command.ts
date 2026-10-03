import { execFile } from "node:child_process";

export type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type RunCommandOptions = {
  workingDirectory: string;
  environment?: NodeJS.ProcessEnv;
  timeoutInMilliseconds?: number;
};

const DEFAULT_TIMEOUT_IN_MILLISECONDS = 120_000;

/**
 * Windows starts `pnpm` through `pnpm.cmd`, which needs a shell; quote each argument for cmd.exe.
 * `^` is cmd.exe's escape character, so a range like `^0.0.1` is always quoted.
 */
function quoteForWindowsShell(commandArgument: string): string {
  return /^[\w@./:\\=~-]+$/.test(commandArgument)
    ? commandArgument
    : `"${commandArgument.replaceAll('"', '""')}"`;
}

/** Runs a command and resolves with its exit code and output. Never rejects on a non-zero exit. */
export function runCommand(
  commandName: string,
  commandArguments: ReadonlyArray<string>,
  runCommandOptions: RunCommandOptions,
): Promise<CommandResult> {
  const isWindows = process.platform === "win32";
  return new Promise((resolvePromise, rejectPromise) => {
    // On Windows the whole command goes to the shell as one string: Node deprecates passing
    // separate arguments together with `shell: true` (DEP0190).
    execFile(
      isWindows
        ? [commandName, ...commandArguments].map(quoteForWindowsShell).join(" ")
        : commandName,
      isWindows ? [] : [...commandArguments],
      {
        cwd: runCommandOptions.workingDirectory,
        env: runCommandOptions.environment ?? process.env,
        timeout: runCommandOptions.timeoutInMilliseconds ?? DEFAULT_TIMEOUT_IN_MILLISECONDS,
        maxBuffer: 32 * 1024 * 1024,
        shell: isWindows,
        windowsHide: true,
      },
      (commandError, stdout, stderr) => {
        if (commandError === null) {
          resolvePromise({ exitCode: 0, stdout, stderr });
          return;
        }
        if (typeof commandError.code === "number") {
          resolvePromise({ exitCode: commandError.code, stdout, stderr });
          return;
        }
        rejectPromise(
          new Error(
            `${commandName} ${commandArguments.join(" ")} did not finish: ${commandError.message}\n${stderr}`,
          ),
        );
      },
    );
  });
}

/** Like `runCommand`, but rejects with the output when the command exits non-zero. */
export async function runCommandOrThrow(
  commandName: string,
  commandArguments: ReadonlyArray<string>,
  runCommandOptions: RunCommandOptions,
): Promise<CommandResult> {
  const commandResult = await runCommand(commandName, commandArguments, runCommandOptions);
  if (commandResult.exitCode !== 0) {
    throw new Error(
      [
        `${commandName} ${commandArguments.join(" ")} exited with ${commandResult.exitCode} in ${runCommandOptions.workingDirectory}`,
        commandResult.stdout,
        commandResult.stderr,
      ].join("\n"),
    );
  }
  return commandResult;
}
