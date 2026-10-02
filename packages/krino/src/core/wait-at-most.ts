/** Resolves when the promise settles or the timeout passes, whichever comes first. Never rejects. */
export function waitAtMost(
  timeoutInMilliseconds: number,
  waitedPromise: Promise<unknown>,
): Promise<void> {
  return new Promise<void>((resolveWait) => {
    const timeoutHandle = setTimeout(resolveWait, Math.max(0, timeoutInMilliseconds));
    const finishWait = (): void => {
      clearTimeout(timeoutHandle);
      resolveWait();
    };
    waitedPromise.then(finishWait, finishWait);
  });
}
