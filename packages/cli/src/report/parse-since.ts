const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;

const HOURS_PER_UNIT: ReadonlyMap<string, number> = new Map([
  ["h", 1],
  ["d", 24],
  ["w", 24 * 7],
]);

const DURATION_PATTERN = /^(\d+)([hdw])$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(T.*)?$/;

export type SinceParseResult =
  | { parseKind: "parsed"; since: Date }
  | { parseKind: "invalid"; message: string };

/**
 * `--since`: a duration back from now (`12h`, `7d`, `2w`) or an ISO 8601 date or time
 * (`2026-09-01`, `2026-09-01T08:00:00Z`; a date alone is midnight UTC).
 */
export function parseSince(sinceText: string, now: Date): SinceParseResult {
  const trimmedText = sinceText.trim();
  const durationMatch = DURATION_PATTERN.exec(trimmedText);
  if (durationMatch !== null) {
    const [, amountText, unit] = durationMatch;
    const hoursPerUnit = unit === undefined ? undefined : HOURS_PER_UNIT.get(unit);
    if (amountText !== undefined && hoursPerUnit !== undefined) {
      return {
        parseKind: "parsed",
        since: new Date(now.getTime() - Number(amountText) * hoursPerUnit * MILLISECONDS_PER_HOUR),
      };
    }
  }
  if (ISO_DATE_PATTERN.test(trimmedText)) {
    const since = new Date(trimmedText);
    if (!Number.isNaN(since.getTime())) {
      return { parseKind: "parsed", since };
    }
  }
  return {
    parseKind: "invalid",
    message: `--since "${sinceText}" is not a duration (12h, 7d, 2w) or an ISO date (2026-09-01).`,
  };
}
