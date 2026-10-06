"use client";

import { THEME_STORAGE_KEY } from "../lib/theme-script";
import { MoonIcon, SunIcon } from "./icons";

/** Flips light and dark and remembers the choice. CSS picks the icon, so nothing hydrates. */
export function ThemeToggle() {
  function toggleTheme() {
    const rootElement = document.documentElement;
    const nextTheme = rootElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    rootElement.setAttribute("data-theme", nextTheme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // Storage can be blocked; the theme still flips for this page view.
    }
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="Toggle light and dark theme"
      title="Toggle theme"
      className="text-fg-3 hover:text-fg grid size-8 place-items-center rounded-md transition-colors duration-200"
    >
      <span className="theme-icon-dark">
        <SunIcon />
      </span>
      <span className="theme-icon-light">
        <MoonIcon />
      </span>
    </button>
  );
}
