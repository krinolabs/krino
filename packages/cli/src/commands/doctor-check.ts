/**
 * `skip`: nothing to check yet (no recent decisions, no multi-step runs). Shown dimmed, never
 * counted as a pass, and never changes the exit code. CLI-only; not part of the contracts.
 */
export type DoctorCheckStatus = "pass" | "warn" | "fail" | "skip";

/** One line of `krino doctor` output. */
export type DoctorCheck = {
  checkName: string;
  checkStatus: DoctorCheckStatus;
  /** What was found. Never holds a secret value. */
  detail: string;
  /** What to do about a warn or fail; `null` on pass and skip. */
  fixLine: string | null;
};

export function passCheck(checkName: string, detail: string): DoctorCheck {
  return { checkName, checkStatus: "pass", detail, fixLine: null };
}

export function warnCheck(checkName: string, detail: string, fixLine: string): DoctorCheck {
  return { checkName, checkStatus: "warn", detail, fixLine };
}

export function failCheck(checkName: string, detail: string, fixLine: string): DoctorCheck {
  return { checkName, checkStatus: "fail", detail, fixLine };
}

export function skipCheck(checkName: string, detail: string): DoctorCheck {
  return { checkName, checkStatus: "skip", detail, fixLine: null };
}
