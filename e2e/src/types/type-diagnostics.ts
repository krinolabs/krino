// Sorts `tsc` diagnostics by where they are. With library checking on, third-party declarations
// (ai 7.0.126, @ai-sdk/*, the MCP SDK) report errors of their own under a strict config; the
// e2e check fails only on krino's declarations and the consumer's own files.

export type ClassifiedDiagnostics = {
  /** Diagnostics in node_modules/@krinolabs/, in the consumer's own files, or without a file. */
  failingDiagnostics: Array<string>;
  /** Diagnostics in any other package. Reported, never failing. */
  thirdPartyDiagnosticCount: number;
};

/** `path(line,column): error TS1234: …` */
const FILE_DIAGNOSTIC_PATTERN = /^(.+?)\(\d+,\d+\): error TS\d+/;
const GLOBAL_DIAGNOSTIC_PATTERN = /^error TS\d+/;

function isKrinoOrConsumerFile(filePath: string): boolean {
  const forwardPath = filePath.replaceAll("\\", "/");
  return (
    forwardPath.includes("node_modules/@krinolabs/") || !/(^|\/)node_modules\//.test(forwardPath)
  );
}

export function classifyTypeDiagnostics(tscOutput: string): ClassifiedDiagnostics {
  const failingDiagnostics: Array<string> = [];
  let thirdPartyDiagnosticCount = 0;
  for (const outputLine of tscOutput.split(/\r?\n/)) {
    const fileMatch = FILE_DIAGNOSTIC_PATTERN.exec(outputLine);
    const filePath = fileMatch?.[1];
    if (filePath !== undefined) {
      if (isKrinoOrConsumerFile(filePath)) {
        failingDiagnostics.push(outputLine);
      } else {
        thirdPartyDiagnosticCount += 1;
      }
    } else if (GLOBAL_DIAGNOSTIC_PATTERN.test(outputLine)) {
      failingDiagnostics.push(outputLine);
    }
  }
  return { failingDiagnostics, thirdPartyDiagnosticCount };
}
