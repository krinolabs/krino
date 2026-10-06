import type { ComponentProps } from "react";
import { CopyButton } from "./copy-button";

const LANGUAGE_LABELS: ReadonlyMap<string, string> = new Map([
  ["ts", "TypeScript"],
  ["typescript", "TypeScript"],
  ["sh", "Terminal"],
  ["bash", "Terminal"],
  ["json", "JSON"],
  ["text", "Output"],
]);

type CodeBlockProps = ComponentProps<"pre"> & { "data-language"?: string };

/** The chrome around a highlighted <pre>: a label strip and a copy button. */
export function CodeBlock(codeBlockProps: CodeBlockProps) {
  const language = codeBlockProps["data-language"] ?? "";
  const languageLabel = LANGUAGE_LABELS.get(language) ?? language;
  return (
    <div className="code-block">
      <div className="code-block-head">
        <span className="code-block-label">{languageLabel}</span>
        <CopyButton eventName="copy_code" />
      </div>
      <pre {...codeBlockProps} />
    </div>
  );
}
