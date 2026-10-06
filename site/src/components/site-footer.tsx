import Link from "next/link";
import { AUTHOR } from "../lib/site";
import { LINKS } from "../links";
import { ConsentSettingsButton } from "./analytics-consent";

export function SiteFooter({ isAnalyticsEnabled }: { isAnalyticsEnabled: boolean }) {
  return (
    <footer className="border-hairline mt-24 border-t">
      <div className="text-fg-3 mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          Built by{" "}
          <a
            href={AUTHOR.url}
            rel="author"
            data-outbound="portfolio"
            className="text-fg-2 hover:text-fg underline decoration-[var(--hairline-strong)] underline-offset-3 transition-colors duration-200"
          >
            {AUTHOR.name}
          </a>
          . MIT licensed.
        </p>
        <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link href="/docs" className="hover:text-fg-2 transition-colors duration-200">
            Docs
          </Link>
          <Link href="/changelog" className="hover:text-fg-2 transition-colors duration-200">
            Changelog
          </Link>
          <a
            href={LINKS.github}
            data-outbound="github"
            className="hover:text-fg-2 transition-colors duration-200"
          >
            GitHub
          </a>
          <a
            href={LINKS.npm}
            data-outbound="npm"
            className="hover:text-fg-2 transition-colors duration-200"
          >
            npm
          </a>
          {isAnalyticsEnabled ? <ConsentSettingsButton /> : null}
        </nav>
      </div>
      {isAnalyticsEnabled ? (
        <p className="text-fg-3 mx-auto w-full max-w-2xl px-4 pb-8 text-xs sm:px-6">
          Analytics cookies are set only if you accept. No ads, no tracking across sites.
        </p>
      ) : null}
    </footer>
  );
}
