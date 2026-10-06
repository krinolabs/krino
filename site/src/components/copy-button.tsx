"use client";

import { type MouseEvent, useEffect, useRef, useState } from "react";
import { type AnalyticsEventName, trackEvent } from "../lib/analytics";
import { CheckIcon, CopyIcon } from "./icons";

type CopyButtonProps = {
  /** Text to copy. Without it, the button copies the <pre> of its code block. */
  text?: string;
  eventName: Extract<AnalyticsEventName, "copy_install" | "copy_code">;
};

const COPIED_DURATION_IN_MILLISECONDS = 1600;

export function CopyButton({ text, eventName }: CopyButtonProps) {
  const [isCopied, setIsCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  async function copyToClipboard(event: MouseEvent<HTMLButtonElement>) {
    const copyText =
      text ?? event.currentTarget.closest(".code-block")?.querySelector("pre")?.textContent ?? "";
    try {
      await navigator.clipboard.writeText(copyText.trimEnd());
    } catch {
      // Clipboard access can be denied; leave the button as it was.
      return;
    }
    setIsCopied(true);
    trackEvent(eventName, { page_path: window.location.pathname });
    clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setIsCopied(false), COPIED_DURATION_IN_MILLISECONDS);
  }

  return (
    <button
      type="button"
      className="copy-button"
      data-copied={isCopied ? "" : undefined}
      onClick={copyToClipboard}
      aria-label={isCopied ? "Copied" : "Copy to clipboard"}
    >
      {isCopied ? <CheckIcon /> : <CopyIcon />}
      <span aria-live="polite">{isCopied ? "Copied" : "Copy"}</span>
    </button>
  );
}
