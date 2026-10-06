type GtagFunction = (...gtagArguments: Array<unknown>) => void;

declare global {
  interface Window {
    gtag?: GtagFunction;
  }
}

export type AnalyticsEventName = "copy_install" | "copy_code" | "outbound_click";

/** Sends a GA4 event when gtag is on the page. A no-op in local and preview builds. */
export function trackEvent(
  eventName: AnalyticsEventName,
  eventParameters: Record<string, string>,
): void {
  try {
    window.gtag?.("event", eventName, eventParameters);
  } catch {
    // Analytics must never break the page.
  }
}

export function updateAnalyticsConsent(analyticsStorage: "granted" | "denied"): void {
  try {
    window.gtag?.("consent", "update", { analytics_storage: analyticsStorage });
  } catch {
    // Analytics must never break the page.
  }
}
