import { EXIT_CODES, runCli } from "./cli/run-cli.js";

// The `krino-bench` bin. Private to the repo: run it with
// `pnpm --filter @krinolabs/bench-runner exec krino-bench …`.

runCli(process.argv.slice(2), {
  writeOutput: (text) => process.stdout.write(text),
  writeError: (text) => process.stderr.write(text),
}).then(
  (exitCode) => {
    process.exitCode = exitCode;
  },
  (runError: unknown) => {
    const errorText = runError instanceof Error ? `${runError.name}: ${runError.message}` : "error";
    process.stderr.write(`krino-bench failed: ${errorText}\n`);
    process.exitCode = EXIT_CODES.failed;
  },
);
