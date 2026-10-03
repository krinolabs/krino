const warnedKeys = new Set<string>();

/** Warns on the console the first time a key is seen in this process; later calls are silent. */
export function warnOncePerProcess(warningKey: string, warningMessage: string): void {
  if (warnedKeys.has(warningKey)) {
    return;
  }
  warnedKeys.add(warningKey);
  console.warn(warningMessage);
}

/** Tests only: lets each test see its own first warning. */
export function forgetWarningsForTests(): void {
  warnedKeys.clear();
}
