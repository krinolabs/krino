import Link from "next/link";
import { LINKS } from "../links";
import { GitHubIcon, NpmIcon } from "./icons";
import { ThemeToggle } from "./theme-toggle";

const ICON_LINK_CLASS =
  "text-fg-3 hover:text-fg grid size-8 place-items-center rounded-md transition-colors duration-200";

export function Wordmark() {
  return (
    <span className="font-pixel text-fg text-sm">
      <span className="text-fg-4">{"// "}</span>krino
    </span>
  );
}

export function SiteHeader() {
  return (
    <header className="border-hairline sticky top-0 z-30 border-b bg-[var(--nav-glass)] backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-2xl items-center justify-between px-4 sm:px-6">
        <Link href="/" aria-label="krino home">
          <Wordmark />
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1">
          <Link
            href="/docs"
            className="text-fg-2 hover:text-fg mr-2 text-sm transition-colors duration-200"
          >
            Docs
          </Link>
          <a
            href={LINKS.github}
            data-outbound="github"
            aria-label="krino on GitHub"
            className={ICON_LINK_CLASS}
          >
            <GitHubIcon />
          </a>
          <a
            href={LINKS.npm}
            data-outbound="npm"
            aria-label="krino on npm"
            className={ICON_LINK_CLASS}
          >
            <NpmIcon />
          </a>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
