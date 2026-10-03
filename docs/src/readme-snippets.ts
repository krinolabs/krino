import { readFileSync } from "node:fs";
import nodePath from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// Compiles every TypeScript code block in the READMEs, as a user with a strict tsconfig would.
// Each block is its own module, resolved from this package, which installs the published entry
// points of @krinolabs/krino and the host SDKs at the versions krino is tested with.

export type CodeBlock = {
  /** Repo-relative path of the Markdown file, with forward slashes. */
  sourcePath: string;
  /** 1-indexed line of the block's first code line in the Markdown file. */
  firstLine: number;
  code: string;
};

/** `path:line: TS1234 message`, with the line in the Markdown file. */
export type SnippetDiagnostic = string;

const DOCS_DIRECTORY = nodePath.resolve(nodePath.dirname(fileURLToPath(import.meta.url)), "..");
export const REPOSITORY_DIRECTORY = nodePath.resolve(DOCS_DIRECTORY, "..");

/** The READMEs whose TypeScript blocks must compile. */
export const README_PATHS: ReadonlyArray<string> = [
  "README.md",
  "packages/krino/README.md",
  "packages/cli/README.md",
];

const OPENING_FENCE_PATTERN = /^(\s*)(`{3,}|~{3,})\s*([\w-]*)/;
const TYPESCRIPT_LANGUAGES: ReadonlySet<string> = new Set(["ts", "typescript"]);

/** Every fenced block tagged `ts` or `typescript`, in order. */
export function extractTypeScriptBlocks(
  markdownText: string,
  sourcePath: string,
): Array<CodeBlock> {
  const markdownLines = markdownText.split(/\r?\n/);
  const codeBlocks: Array<CodeBlock> = [];
  let lineIndex = 0;
  while (lineIndex < markdownLines.length) {
    const openingMatch = OPENING_FENCE_PATTERN.exec(markdownLines[lineIndex] ?? "");
    if (openingMatch === null) {
      lineIndex += 1;
      continue;
    }
    const fence = openingMatch[2] ?? "```";
    const language = (openingMatch[3] ?? "").toLowerCase();
    const firstCodeIndex = lineIndex + 1;
    let closingIndex = firstCodeIndex;
    while (
      closingIndex < markdownLines.length &&
      !(markdownLines[closingIndex] ?? "").trim().startsWith(fence)
    ) {
      closingIndex += 1;
    }
    if (TYPESCRIPT_LANGUAGES.has(language)) {
      codeBlocks.push({
        sourcePath,
        firstLine: firstCodeIndex + 1,
        code: markdownLines.slice(firstCodeIndex, closingIndex).join("\n"),
      });
    }
    lineIndex = closingIndex + 1;
  }
  return codeBlocks;
}

/** Reads the READMEs and returns their TypeScript blocks. */
export function readReadmeBlocks(): Array<CodeBlock> {
  return README_PATHS.flatMap((readmePath) =>
    extractTypeScriptBlocks(
      readFileSync(nodePath.join(REPOSITORY_DIRECTORY, readmePath), "utf8"),
      readmePath,
    ),
  );
}

/** The repo's strict settings (tsconfig.base.json), as a consumer project would set them. */
const SNIPPET_COMPILER_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  lib: ["lib.es2022.d.ts"],
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  types: ["node"],
  strict: true,
  noUncheckedIndexedAccess: true,
  exactOptionalPropertyTypes: true,
  verbatimModuleSyntax: true,
  isolatedModules: true,
  esModuleInterop: true,
  skipLibCheck: true,
  noEmit: true,
};

function toForwardSlashes(filePath: string): string {
  return filePath.replaceAll("\\", "/");
}

/**
 * Type-checks the blocks in one program. Each block becomes a virtual `.ts` file inside this
 * package (so imports resolve from its node_modules); nothing is written to disk.
 */
export function compileCodeBlocks(codeBlocks: ReadonlyArray<CodeBlock>): Array<SnippetDiagnostic> {
  const snippetDirectory = toForwardSlashes(nodePath.join(DOCS_DIRECTORY, ".readme-snippets"));
  const blocksByFileKey = new Map<string, { fileName: string; codeBlock: CodeBlock }>();
  for (const [blockIndex, codeBlock] of codeBlocks.entries()) {
    const fileName = `${snippetDirectory}/block-${blockIndex}.ts`;
    blocksByFileKey.set(fileName.toLowerCase(), { fileName, codeBlock });
  }
  const findBlock = (fileName: string) =>
    blocksByFileKey.get(toForwardSlashes(fileName).toLowerCase());

  const compilerHost = ts.createCompilerHost(SNIPPET_COMPILER_OPTIONS, true);
  const readRealFile = compilerHost.readFile.bind(compilerHost);
  const realFileExists = compilerHost.fileExists.bind(compilerHost);
  const getRealSourceFile = compilerHost.getSourceFile.bind(compilerHost);
  // `export {}` keeps a block without imports a module, so top-level await works and blocks
  // never share names. It goes after the last line, so line numbers stay the same.
  const virtualText = (codeBlock: CodeBlock) => `${codeBlock.code}\nexport {};\n`;

  compilerHost.fileExists = (fileName) =>
    findBlock(fileName) !== undefined || realFileExists(fileName);
  compilerHost.readFile = (fileName) => {
    const virtualBlock = findBlock(fileName);
    return virtualBlock === undefined
      ? readRealFile(fileName)
      : virtualText(virtualBlock.codeBlock);
  };
  compilerHost.getSourceFile = (fileName, languageVersion, onError, shouldCreate) => {
    const virtualBlock = findBlock(fileName);
    return virtualBlock === undefined
      ? getRealSourceFile(fileName, languageVersion, onError, shouldCreate)
      : ts.createSourceFile(fileName, virtualText(virtualBlock.codeBlock), languageVersion, true);
  };

  const program = ts.createProgram({
    rootNames: [...blocksByFileKey.values()].map((virtualBlock) => virtualBlock.fileName),
    options: SNIPPET_COMPILER_OPTIONS,
    host: compilerHost,
  });

  return ts.getPreEmitDiagnostics(program).map((diagnostic) => {
    const messageText = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
    const virtualBlock =
      diagnostic.file === undefined ? undefined : findBlock(diagnostic.file.fileName);
    if (diagnostic.file === undefined || diagnostic.start === undefined) {
      return `TS${diagnostic.code} ${messageText}`;
    }
    const { line } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
    if (virtualBlock === undefined) {
      return `${toForwardSlashes(diagnostic.file.fileName)}:${line + 1}: TS${diagnostic.code} ${messageText}`;
    }
    const markdownLine = virtualBlock.codeBlock.firstLine + line;
    return `${virtualBlock.codeBlock.sourcePath}:${markdownLine}: TS${diagnostic.code} ${messageText}`;
  });
}
