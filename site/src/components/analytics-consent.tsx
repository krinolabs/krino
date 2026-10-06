"use client";

import { useEffect, useState } from "react";
import { trackEvent, updateAnalyticsConsent } from "../lib/analytics";
import { CONSENT_STORAGE_KEY, type ConsentChoice, parseStoredConsent } from "../lib/consent";

const OPEN_CONSENT_EVENT = "krino:open-consent";

function readStoredConsent() {
  try {
    return parseStoredConsent(localStorage.getItem(CONSENT_STORAGE_KEY));
  } catch {
    return "unset";
  }
}

/** Tracks clicks on links marked `data-outbound="<name>"`. */
function trackOutboundClick(event: globalThis.MouseEvent) {
  if (!(event.target instanceof Element)) {
    return;
  }
  const outboundLink = event.target.closest("[data-outbound]");
  if (outboundLink === null) {
    return;
  }
  trackEvent("outbound_click", {
    link_name: outboundLink.getAttribute("data-outbound") ?? "",
    page_path: window.location.pathname,
  });
}

/**
 * The one-line consent bar, plus outbound-click tracking. Rendered only when GA is on
 * (production with a measurement id), so local and preview builds show nothing.
 */
export function AnalyticsConsent() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (readStoredConsent() === "unset") {
      setIsOpen(true);
    }
    const openConsentBar = () => setIsOpen(true);
    window.addEventListener(OPEN_CONSENT_EVENT, openConsentBar);
    document.addEventListener("click", trackOutboundClick);
    return () => {
      window.removeEventListener(OPEN_CONSENT_EVENT, openConsentBar);
      document.removeEventListener("click", trackOutboundClick);
    };
  }, []);

  function choose(consentChoice: ConsentChoice) {
    try {
      localStorage.setItem(CONSENT_STORAGE_KEY, consentChoice);
    } catch {
      // Without storage the bar asks again next visit; the choice still applies now.
    }
    updateAnalyticsConsent(consentChoice);
    setIsOpen(false);
  }

  return isOpen ? (
    <section
      aria-label="Analytics consent"
      className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4"
    >
      <div className="border-hairline-strong text-fg-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-lg border bg-[var(--nav-glass)] px-4 py-2.5 text-sm shadow-lg backdrop-blur-md">
        <p>Cookies for anonymous analytics?</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => choose("granted")}
            className="bg-accent-muted text-accent-fg hover:bg-accent/20 rounded-md px-2.5 py-1 font-medium transition-colors duration-200"
          >
            Accept
          </button>
          <button
            type="button"
            onClick={() => choose("denied")}
            className="text-fg-2 hover:text-fg rounded-md px-2.5 py-1 transition-colors duration-200"
          >
            Decline
          </button>
        </div>
      </div>
    </section>
  ) : null;
}

/** Footer link that reopens the consent bar. */
export function ConsentSettingsButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_CONSENT_EVENT))}
      className="hover:text-fg-2 transition-colors duration-200"
    >
      Cookie settings
    </button>
  );
}
