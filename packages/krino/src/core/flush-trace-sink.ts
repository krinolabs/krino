import type { TraceSink } from "../contracts/index.js";
import { waitAtMost } from "./wait-at-most.js";

/** Flushes the sink, waiting at most the timeout. Never rejects; failures become warnings. */
export async function flushTraceSinkSafely(
  traceSink: TraceSink,
  timeoutInMilliseconds: number,
  warn: (warningMessage: string) => void,
): Promise<void> {
  let sinkFlush: Promise<void>;
  try {
    sinkFlush = Promise.resolve(traceSink.flush(timeoutInMilliseconds));
  } catch (flushError) {
    sinkFlush = Promise.reject(flushError);
  }
  sinkFlush.catch((flushError: unknown) => {
    warn(`krino: trace sink failed to flush: ${String(flushError)}`);
  });
  await waitAtMost(timeoutInMilliseconds, sinkFlush);
}
