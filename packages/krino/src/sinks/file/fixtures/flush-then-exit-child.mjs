// Child process for file-trace-sink.child-process.test.ts.
// Writes trace lines, awaits flush, and exits at once with process.exit.
// It loads the TypeScript source with Node's type stripping, so it maps `./x.js` imports to `./x.ts`.
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (resolveError) {
      if (specifier.startsWith(".") && specifier.endsWith(".js")) {
        return nextResolve(`${specifier.slice(0, -3)}.ts`, context);
      }
      throw resolveError;
    }
  },
});

const [sinkModuleUrl, traceDirectory, childName, lineCountText, flushTimeoutText] =
  process.argv.slice(2);
const { createFileTraceSink } = await import(sinkModuleUrl);

const traceSink = createFileTraceSink({ projectName: "child-process-test", traceDirectory });
const lineCount = Number(lineCountText);
for (let stepNumber = 0; stepNumber < lineCount; stepNumber += 1) {
  traceSink.writeRecord({
    traceSchemaVersion: 1,
    recordType: "agentStep",
    projectName: "child-process-test",
    runIdentifier: childName,
    stepNumber,
    hostName: "ai-sdk",
    hostSdkVersion: "7.0.0-test",
    modelIdentifier: "claude-sonnet-5-5",
    availableToolNames: ["search"],
    chosenToolNames: ["search"],
    tokenUsage: null,
    costInUsd: null,
    latencyInMilliseconds: null,
    recordedAt: new Date().toISOString(),
    decisions: [],
    contentHash: null,
  });
  if (stepNumber % 50 === 0) {
    // Let some batches start mid-loop, as a real agent would.
    await new Promise((resolveTick) => setImmediate(resolveTick));
  }
}
await traceSink.flush(Number(flushTimeoutText));
process.exit(0);
