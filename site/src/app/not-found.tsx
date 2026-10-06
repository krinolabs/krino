import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-24 sm:px-6">
      <p className="text-fg-3 font-mono text-xs">404</p>
      <h1 className="text-fg mt-2 text-xl font-semibold">This page does not exist.</h1>
      <p className="text-fg-2 mt-3">
        Go to the{" "}
        <Link href="/" className="text-fg underline underline-offset-3">
          home page
        </Link>{" "}
        or the{" "}
        <Link href="/docs" className="text-fg underline underline-offset-3">
          docs
        </Link>
        .
      </p>
    </div>
  );
}
