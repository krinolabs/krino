import { describe, expect, it } from "vitest";
import { MOCK_TOOL_CATALOG } from "./mock-tool-catalog.js";
import { MOCK_TOOL_DOMAIN_NAMES, type MockToolDomainName } from "./mock-tool-definition.js";

function collectDomainNotes(): Map<MockToolDomainName, Set<string>> {
  const domainNotesByDomain = new Map<MockToolDomainName, Set<string>>();
  for (const toolDefinition of MOCK_TOOL_CATALOG) {
    const domainNotes = domainNotesByDomain.get(toolDefinition.domainName) ?? new Set<string>();
    domainNotes.add(toolDefinition.domainNote);
    domainNotesByDomain.set(toolDefinition.domainName, domainNotes);
  }
  return domainNotesByDomain;
}

function splitSentences(noteText: string): Array<string> {
  return noteText.split(/(?<=\.)\s+/).filter((sentence) => sentence.length > 0);
}

const ALL_PARAMETER_NAMES = new Set(
  MOCK_TOOL_CATALOG.flatMap((toolDefinition) =>
    toolDefinition.parameters.map((parameter) => parameter.parameterName),
  ),
);

describe("domain notes (the only text shared across tools)", () => {
  const domainNotesByDomain = collectDomainNotes();

  it("ends every tool description with its domain note", () => {
    for (const toolDefinition of MOCK_TOOL_CATALOG) {
      expect(
        toolDefinition.toolDescription.endsWith(`

${toolDefinition.domainNote}`),
        toolDefinition.toolName,
      ).toBe(true);
    }
  });

  it.each(MOCK_TOOL_DOMAIN_NAMES)("uses exactly one note in the %s domain", (domainName) => {
    expect(domainNotesByDomain.get(domainName)?.size).toBe(1);
  });

  it("never shares note text between two domains", () => {
    const domainNotes = [...domainNotesByDomain.values()].flatMap((domainNoteSet) => [
      ...domainNoteSet,
    ]);
    expect(domainNotes).toHaveLength(MOCK_TOOL_DOMAIN_NAMES.length);
    expect(new Set(domainNotes).size).toBe(domainNotes.length);
  });

  it("never repeats a note sentence in two domains", () => {
    const domainNameBySentence = new Map<string, MockToolDomainName>();
    for (const [domainName, domainNoteSet] of domainNotesByDomain) {
      for (const sentence of [...domainNoteSet].flatMap(splitSentences)) {
        const earlierDomainName = domainNameBySentence.get(sentence);
        expect(
          earlierDomainName,
          `"${sentence}" is in ${earlierDomainName} and ${domainName}`,
        ).toBe(undefined);
        domainNameBySentence.set(sentence, domainName);
      }
    }
  });

  it("names no parameter of any tool", () => {
    for (const [domainName, domainNoteSet] of domainNotesByDomain) {
      for (const domainNote of domainNoteSet) {
        const noteWords = domainNote.match(/[A-Za-z]+/g) ?? [];
        const parameterWords = noteWords.filter((noteWord) => ALL_PARAMETER_NAMES.has(noteWord));
        expect(parameterWords, domainName).toEqual([]);
      }
    }
  });

  it("contains no camelCase identifiers", () => {
    for (const [domainName, domainNoteSet] of domainNotesByDomain) {
      for (const domainNote of domainNoteSet) {
        expect(domainNote, domainName).not.toMatch(/\b[a-z]+[A-Z]\w*\b/);
      }
    }
  });
});
