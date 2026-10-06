export type ConsentChoice = "granted" | "denied";

export type StoredConsent = ConsentChoice | "unset";

export const CONSENT_STORAGE_KEY = "krino-analytics-consent";

/** Reads a stored value. Anything other than a known choice counts as no choice yet. */
export function parseStoredConsent(storedValue: string | null | undefined): StoredConsent {
  return storedValue === "granted" || storedValue === "denied" ? storedValue : "unset";
}

const MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]{4,20}$/;

/**
 * The GA4 measurement id, only on production deployments and only when it is well formed.
 * The id is written into an inline script, so a malformed value is dropped, never escaped.
 */
export function resolveMeasurementId(
  configuredMeasurementId: string | undefined,
  vercelEnvironment: string | undefined,
): string | undefined {
  if (vercelEnvironment !== "production" || configuredMeasurementId === undefined) {
    return undefined;
  }
  const measurementId = configuredMeasurementId.trim();
  return MEASUREMENT_ID_PATTERN.test(measurementId) ? measurementId : undefined;
}

/**
 * Runs in <head> before gtag.js: Consent Mode v2 defaults to denied, then applies a stored
 * Accept. GA sends cookieless pings until the visitor accepts.
 */
export function consentBootstrapScript(measurementId: string): string {
  const storageKey = JSON.stringify(CONSENT_STORAGE_KEY);
  return [
    "window.dataLayer=window.dataLayer||[];",
    "function gtag(){dataLayer.push(arguments);}",
    "gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',wait_for_update:500});",
    `try{if(localStorage.getItem(${storageKey})==='granted'){gtag('consent','update',{analytics_storage:'granted'});}}catch(error){}`,
    "gtag('js',new Date());",
    `gtag('config',${JSON.stringify(measurementId)});`,
  ].join("");
}
