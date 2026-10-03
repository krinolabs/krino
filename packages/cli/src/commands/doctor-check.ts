export type DoctorCheckStatus = "pass" | "warn" | "fail";

/** One line of `krino doctor` output. */
export type DoctorCheck = {
  checkName: string;
  checkStatus: DoctorCheckStatus;
  /** What was found. Never holds a secret value. */
  detail: string;
  /** What to do about a warn or fail; `null` on pass. */
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
