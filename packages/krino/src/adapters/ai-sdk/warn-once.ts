// Some adapter warnings are printed once per process, so a loop of runs does not flood the log.

const emittedWarningKeys = new Set<string>();

export function warnOnce(warningKey: string, warningMessage: string): void {
  if (emittedWarningKeys.has(warningKey)) {
    return;
  }
  emittedWarningKeys.add(warningKey);
  console.warn(warningMessage);
}

/** Tests only: forget which warnings were printed. */
export function resetWarningsForTesting(): void {
  emittedWarningKeys.clear();
}
