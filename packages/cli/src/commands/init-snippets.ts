import nodePath from "node:path";
import type { HostName } from "@krinolabs/krino";

export type WrapperSnippetInput = {
  projectName: string;
  /** `--trace-dir` as typed; `null` keeps the sink's default folder. */
  traceDirectory: string | null;
};

function isAbsoluteOnAnyPlatform(directoryPath: string): boolean {
  return nodePath.win32.isAbsolute(directoryPath) || nodePath.posix.isAbsolute(directoryPath);
}

function createKrinoLines(snippetInput: WrapperSnippetInput): Array<string> {
  const projectNameLiteral = JSON.stringify(snippetInput.projectName);
  const sinkLines =
    snippetInput.traceDirectory === null
      ? []
      : [
          ...(isAbsoluteOnAnyPlatform(snippetInput.traceDirectory)
            ? []
            : [
                "  // The sink resolves a relative folder from the working folder, the CLI from",
                "  // krino.config.json's folder. Use an absolute path or set KRINO_TRACE_DIRECTORY",
                "  // so the runtime and the CLI use the same folder.",
              ]),
          `  traceSink: createFileTraceSink({ projectName: ${projectNameLiteral}, traceDirectory: ${JSON.stringify(snippetInput.traceDirectory)} }),`,
        ];
  return [
    "const krino = createKrino({",
    `  projectName: ${projectNameLiteral},`,
    '  decisionModes: { toolSelection: "shadow", riskGate: "shadow" },',
    ...sinkLines,
    "});",
  ];
}

function krinoRootImport(snippetInput: WrapperSnippetInput): string {
  return snippetInput.traceDirectory === null
    ? 'import { createKrino } from "@krinolabs/krino";'
    : 'import { createFileTraceSink, createKrino } from "@krinolabs/krino";';
}

/** TypeScript that wires krino into one host, every decision kind in shadow mode. */
export function renderWrapperSnippet(
  hostName: HostName,
  snippetInput: WrapperSnippetInput,
): string {
  if (hostName === "ai-sdk") {
    return [
      krinoRootImport(snippetInput),
      'import { withKrino } from "@krinolabs/krino/ai-sdk";',
      'import { generateText } from "ai";',
      "",
      ...createKrinoLines(snippetInput),
      "",
      "// Wrap the options of each generateText / streamText call:",
      "const result = await generateText(withKrino({ model, tools, prompt }, krino));",
    ].join("\n");
  }
  return [
    'import { query } from "@anthropic-ai/claude-agent-sdk";',
    krinoRootImport(snippetInput),
    'import { krinoAgentOptions, observeKrinoMessages } from "@krinolabs/krino/claude-agent-sdk";',
    "",
    ...createKrinoLines(snippetInput),
    "",
    "// Per run: krino's query options, then observe the message stream.",
    "const krinoRun = await krinoAgentOptions({ allowedTools }, krino, prompt);",
    "for await (const message of observeKrinoMessages(query({ prompt, options: krinoRun.queryOptions }), krinoRun)) {",
    "  // Handle each message as before.",
    "}",
  ].join("\n");
}
