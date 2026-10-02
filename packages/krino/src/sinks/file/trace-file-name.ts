/** `traces-2026-10-02.jsonl`, then `traces-2026-10-02.1.jsonl`, `.2`, … after each rotation. */
const TRACE_FILE_NAME_PATTERN = /^traces-(\d{4}-\d{2}-\d{2})(?:\.([1-9]\d*))?\.jsonl$/;

/** Rotate the current file once the next line would push it past this size. */
export const TRACE_FILE_ROTATION_SIZE_IN_BYTES = 50 * 1024 * 1024;

export type TraceFileName = {
  /** `YYYY-MM-DD` in UTC. */
  utcDay: string;
  /** 0 for the first file of the day. */
  rotationIndex: number;
};

export function utcDayOf(moment: Date): string {
  return moment.toISOString().slice(0, 10);
}

export function formatTraceFileName({ utcDay, rotationIndex }: TraceFileName): string {
  return rotationIndex === 0 ? `traces-${utcDay}.jsonl` : `traces-${utcDay}.${rotationIndex}.jsonl`;
}

/** `null` for any file that is not a krino trace file. */
export function parseTraceFileName(fileName: string): TraceFileName | null {
  const match = TRACE_FILE_NAME_PATTERN.exec(fileName);
  if (match === null || match[1] === undefined) {
    return null;
  }
  return { utcDay: match[1], rotationIndex: match[2] === undefined ? 0 : Number(match[2]) };
}

/** The highest rotation index already on disk for the day, or 0. */
export function latestRotationIndex(fileNames: ReadonlyArray<string>, utcDay: string): number {
  let latestIndex = 0;
  for (const fileName of fileNames) {
    const traceFileName = parseTraceFileName(fileName);
    if (traceFileName !== null && traceFileName.utcDay === utcDay) {
      latestIndex = Math.max(latestIndex, traceFileName.rotationIndex);
    }
  }
  return latestIndex;
}
