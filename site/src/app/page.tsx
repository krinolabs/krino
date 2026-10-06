import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import QuickLook from "../../content/home/quick-look.mdx";
import { GitHubIcon, NpmIcon } from "../components/icons";
import { InstallCommand } from "../components/install-command";
import { JsonLd } from "../components/json-ld";
import { softwareSourceCodeJsonLd } from "../lib/seo";
import { SITE_URL } from "../lib/site";
import { LINKS } from "../links";

export const metadata: Metadata = { alternates: { canonical: SITE_URL } };

const FLOW_STEPS: ReadonlyArray<{ name: string; text: ReactNode }> = [
  {
    name: "Shadow",
    text: "krino asks a small decision model in the background and records its answers. Your agent behaves exactly as before.",
  },
  {
    name: "Report",
    text: (
      <>
        <code className="text-fg font-mono text-[0.9em]">npx krino report</code> shows how often
        krino agreed with your agent, what it would save, and the latency it adds.
      </>
    ),
  },
  {
    name: "Enforce",
    text: "When the data agrees, turn on enforce mode for tool selection. If krino is slow or unsure, your agent gets all its tools.",
  },
];

const PRINCIPLES: ReadonlyArray<{ name: string; text: string }> = [
  {
    name: "Tool selection fails open",
    text: "On a timeout, an error, or a low-confidence answer, your agent gets all its tools. The worst case is the cost you pay today.",
  },
  {
    name: "The risk gate fails closed",
    text: "When unsure, it suggests asking a human. Block lists in your code always win over the model.",
  },
  {
    name: "Tools change only at step 0",
    text: "A later change would break the prompt cache, so krino picks tools once and keeps that list.",
  },
  {
    name: "Traces stay on your machine",
    text: "Daily JSONL files, with no raw task text or messages by default. Costs count cache reads and writes.",
  },
];

function SectionLabel({ children }: { children: string }) {
  return <h2 className="text-fg-3 mb-5 font-mono text-xs font-medium lowercase">{children}</h2>;
}

export default function HomePage() {
  return (
    <>
      <JsonLd data={softwareSourceCodeJsonLd()} />
      <div className="aurora" aria-hidden="true">
        <span className="aurora-depth" />
        <span className="aurora-warm" />
        <span className="aurora-glow" />
      </div>

      <div className="relative mx-auto w-full max-w-2xl px-4 sm:px-6">
        <section className="pt-20 pb-16 sm:pt-28">
          <p className="text-fg-3 mb-5 font-mono text-xs">v0.1 · experimental · MIT</p>
          <h1 className="text-fg text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            Watch, price, and safely cheapen the small decisions your AI agent makes.
          </h1>
          <p className="text-fg-2 mt-5 text-base leading-relaxed text-pretty">
            krino is a TypeScript library for the Vercel AI SDK and the Claude Agent SDK. It puts a
            small, cheap decision model next to your agent, records what it would decide, and shows
            what that would save. You turn it on only when the data agrees.
          </p>
          <div className="mt-8 max-w-sm">
            <InstallCommand />
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
            <Link
              href="/docs/quick-start-ai-sdk"
              className="bg-accent hover:bg-accent/90 rounded-md px-3.5 py-2 font-medium text-white transition-colors duration-200 dark:text-[var(--canvas)]"
            >
              Get started
            </Link>
            <a
              href={LINKS.github}
              data-outbound="github"
              className="text-fg-2 hover:text-fg inline-flex items-center gap-2 transition-colors duration-200"
            >
              <GitHubIcon size={15} />
              GitHub
            </a>
            <a
              href={LINKS.npm}
              data-outbound="npm"
              className="text-fg-2 hover:text-fg inline-flex items-center gap-2 transition-colors duration-200"
            >
              <NpmIcon size={15} />
              npm
            </a>
          </div>
        </section>

        <section className="border-hairline border-t py-14">
          <SectionLabel>how it works</SectionLabel>
          <ol className="flex flex-col gap-6">
            {FLOW_STEPS.map((flowStep, stepIndex) => (
              <li key={flowStep.name} className="flex gap-4">
                <span className="border-hairline-strong text-fg-2 grid size-6 shrink-0 place-items-center rounded-full border font-mono text-xs">
                  {stepIndex + 1}
                </span>
                <div>
                  <h3 className="text-fg text-base font-medium">{flowStep.name}</h3>
                  <p className="text-fg-2 mt-1 text-base leading-relaxed">{flowStep.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-hairline border-t py-14">
          <SectionLabel>quick look</SectionLabel>
          <div className="prose-docs">
            <QuickLook />
          </div>
          <Link
            href="/docs/quick-start-ai-sdk"
            className="text-accent-fg text-sm font-medium hover:underline hover:underline-offset-4"
          >
            Follow the quick start →
          </Link>
        </section>

        <section className="border-hairline border-t py-14">
          <SectionLabel>built to fail safe</SectionLabel>
          <dl className="grid gap-x-8 gap-y-7 sm:grid-cols-2">
            {PRINCIPLES.map((principle) => (
              <div key={principle.name}>
                <dt className="text-fg text-base font-medium">{principle.name}</dt>
                <dd className="text-fg-2 mt-1 text-sm leading-relaxed">{principle.text}</dd>
              </div>
            ))}
          </dl>
          <p className="text-fg-3 mt-10 text-sm">
            krino is experimental and its APIs may change in any release.{" "}
            <Link
              href="/docs/limitations"
              className="text-fg-2 hover:text-fg underline underline-offset-3"
            >
              Read the limitations
            </Link>
            .
          </p>
        </section>
      </div>
    </>
  );
}
