import type { MDXComponents } from "mdx/types";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { CodeBlock } from "./components/code-block";

/** Numbered steps: every ## heading inside gets a counter. */
function Steps({ children }: { children: ReactNode }) {
  return <div className="steps">{children}</div>;
}

/** Markdown links carry only an href and text. Internal ones use next/link. */
function MarkdownLink({ href = "", children }: ComponentProps<"a">) {
  return href.startsWith("/") ? <Link href={href}>{children}</Link> : <a href={href}>{children}</a>;
}

function MarkdownTable(tableProps: ComponentProps<"table">) {
  return (
    <div className="table-scroll">
      <table {...tableProps} />
    </div>
  );
}

const MDX_COMPONENTS: MDXComponents = {
  a: MarkdownLink,
  pre: CodeBlock,
  table: MarkdownTable,
  Steps,
};

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return { ...components, ...MDX_COMPONENTS };
}
