import { buildInputJsonSchema } from "./input-schema.js";
import { MOCK_TOOL_CATALOG } from "./mock-tool-catalog.js";
import type { MockToolDefinition, MockToolDomainName } from "./mock-tool-definition.js";

/** Rough rule used across the plan: one token per four characters. */
export const CHARACTERS_PER_TOKEN = 4;

/** The tool definition as the model API receives it: name, description, JSON Schema input. */
export function serializeToolDefinition(toolDefinition: MockToolDefinition): string {
  return JSON.stringify({
    name: toolDefinition.toolName,
    description: toolDefinition.toolDescription,
    input_schema: buildInputJsonSchema(toolDefinition),
  });
}

export type CatalogSizeEstimate = {
  toolCount: number;
  characterCount: number;
  estimatedTokenCount: number;
};

export function estimateCatalogSize(
  toolDefinitions: ReadonlyArray<MockToolDefinition> = MOCK_TOOL_CATALOG,
): CatalogSizeEstimate {
  const characterCount = toolDefinitions.reduce(
    (runningCount, toolDefinition) => runningCount + serializeToolDefinition(toolDefinition).length,
    0,
  );
  return {
    toolCount: toolDefinitions.length,
    characterCount,
    estimatedTokenCount: Math.round(characterCount / CHARACTERS_PER_TOKEN),
  };
}

/** Share of one tool's description that is its domain note: the only text shared across tools. */
export function measureDomainNoteShare(toolDefinition: MockToolDefinition): number {
  return toolDefinition.domainNote.length / toolDefinition.toolDescription.length;
}

export type DomainNoteShareReport = {
  /** Mean over tools of each description's domain-note share, 0 to 1. */
  averageDomainNoteShare: number;
  averageDomainNoteShareByDomain: ReadonlyMap<MockToolDomainName, number>;
};

function averageOf(values: ReadonlyArray<number>): number {
  return values.reduce((runningTotal, value) => runningTotal + value, 0) / values.length;
}

export function reportDomainNoteShare(
  toolDefinitions: ReadonlyArray<MockToolDefinition> = MOCK_TOOL_CATALOG,
): DomainNoteShareReport {
  const noteSharesByDomain = new Map<MockToolDomainName, Array<number>>();
  for (const toolDefinition of toolDefinitions) {
    const domainShares = noteSharesByDomain.get(toolDefinition.domainName) ?? [];
    domainShares.push(measureDomainNoteShare(toolDefinition));
    noteSharesByDomain.set(toolDefinition.domainName, domainShares);
  }
  return {
    averageDomainNoteShare: averageOf(toolDefinitions.map(measureDomainNoteShare)),
    averageDomainNoteShareByDomain: new Map(
      [...noteSharesByDomain].map(([domainName, domainShares]) => [
        domainName,
        averageOf(domainShares),
      ]),
    ),
  };
}
