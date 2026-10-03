import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import nodePath from "node:path";
import { describe, expect, it } from "vitest";
import { renderWrapperSnippet } from "./init-snippets.js";

const snippetInput = { projectName: "shop", traceDirectory: null };

/** Names a snippet imports from one module: `import { a, b } from "module";`. */
function importedNames(snippetText: string, moduleName: string): Array<string> {
  const importPattern = new RegExp(
    `import \\{([^}]+)\\} from "${moduleName.replace("/", "\\/")}";`,
  );
  const importMatch = importPattern.exec(snippetText);
  return importMatch?.[1] === undefined
    ? []
    : importMatch[1].split(",").map((importedName) => importedName.trim());
}

/** The type declarations of a `@krinolabs/krino` entry point, from its built `dist`. */
function krinoDeclarations(subpath: string): string {
  const krinoManifestPath = createRequire(import.meta.url).resolve("@krinolabs/krino/package.json");
  const krinoManifest: unknown = JSON.parse(readFileSync(krinoManifestPath, "utf8"));
  const exportsField =
    typeof krinoManifest === "object" && krinoManifest !== null && "exports" in krinoManifest
      ? krinoManifest.exports
      : undefined;
  const entryExports =
    typeof exportsField === "object" && exportsField !== null
      ? new Map(Object.entries(exportsField)).get(subpath)
      : undefined;
  const typesPath =
    typeof entryExports === "object" && entryExports !== null && "types" in entryExports
      ? entryExports.types
      : undefined;
  if (typeof typesPath !== "string") {
    throw new Error(`@krinolabs/krino has no types for ${subpath}`);
  }
  return readFileSync(nodePath.join(nodePath.dirname(krinoManifestPath), typesPath), "utf8");
}

describe("renderWrapperSnippet for the AI SDK", () => {
  const snippetText = renderWrapperSnippet("ai-sdk", snippetInput);

  it("wraps generateText options with withKrino", () => {
    expect(snippetText).toContain('import { withKrino } from "@krinolabs/krino/ai-sdk";');
    expect(snippetText).toContain("generateText(withKrino({ model, tools, prompt }, krino))");
  });

  it("creates the runtime with every decision kind in shadow mode", () => {
    expect(snippetText).toContain('projectName: "shop"');
    expect(snippetText).toContain('decisionModes: { toolSelection: "shadow", riskGate: "shadow" }');
  });

  it("imports only names the built entry points export", () => {
    for (const [moduleName, subpath] of [
      ["@krinolabs/krino", "."],
      ["@krinolabs/krino/ai-sdk", "./ai-sdk"],
    ] as const) {
      const declarations = krinoDeclarations(subpath);
      const names = importedNames(snippetText, moduleName);
      expect(names.length).toBeGreaterThan(0);
      for (const importedName of names) {
        expect(declarations).toMatch(new RegExp(`\\b${importedName}\\b`));
      }
    }
  });
});

describe("renderWrapperSnippet for the Claude Agent SDK", () => {
  const snippetText = renderWrapperSnippet("claude-agent-sdk", snippetInput);

  it("passes krinoAgentOptions' query options to query and observes the messages", () => {
    expect(snippetText).toContain(
      'import { krinoAgentOptions, observeKrinoMessages } from "@krinolabs/krino/claude-agent-sdk";',
    );
    expect(snippetText).toContain("await krinoAgentOptions({ allowedTools }, krino, prompt)");
    expect(snippetText).toContain(
      "observeKrinoMessages(query({ prompt, options: krinoRun.queryOptions }), krinoRun)",
    );
  });

  it("imports only names the built entry points export", () => {
    for (const [moduleName, subpath] of [
      ["@krinolabs/krino", "."],
      ["@krinolabs/krino/claude-agent-sdk", "./claude-agent-sdk"],
    ] as const) {
      const declarations = krinoDeclarations(subpath);
      const names = importedNames(snippetText, moduleName);
      expect(names.length).toBeGreaterThan(0);
      for (const importedName of names) {
        expect(declarations).toMatch(new RegExp(`\\b${importedName}\\b`));
      }
    }
  });
});

describe("renderWrapperSnippet options", () => {
  it("writes the project name as a JSON string literal", () => {
    const snippetText = renderWrapperSnippet("ai-sdk", {
      projectName: 'sh"op\\x',
      traceDirectory: null,
    });
    expect(snippetText).toContain('projectName: "sh\\"op\\\\x"');
  });

  it("leaves the trace sink out by default", () => {
    expect(renderWrapperSnippet("ai-sdk", snippetInput)).not.toContain("createFileTraceSink");
  });

  it("passes --trace-dir to the file sink", () => {
    const snippetText = renderWrapperSnippet("claude-agent-sdk", {
      projectName: "shop",
      traceDirectory: "C:\\krino traces",
    });
    expect(snippetText).toContain(
      'import { createFileTraceSink, createKrino } from "@krinolabs/krino";',
    );
    expect(snippetText).toContain(
      'traceSink: createFileTraceSink({ projectName: "shop", traceDirectory: "C:\\\\krino traces" })',
    );
  });
});
