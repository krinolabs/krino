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

/** Share of one tool's description taken by its domain note, including the joining space. */
export function measurePaddingShare(toolDefinition: MockToolDefinition): number {
  const paddingLength = toolDefinition.domainNote.length + 1;
  return paddingLength / toolDefinition.toolDescription.length;
}

export type PaddingShareReport = {
  /** Mean over tools of each description's padding share, 0 to 1. */
  averagePaddingShare: number;
  averagePaddingShareByDomain: ReadonlyMap<MockToolDomainName, number>;
};

function averageOf(values: ReadonlyArray<number>): number {
  return values.reduce((runningTotal, value) => runningTotal + value, 0) / values.length;
}

export function reportPaddingShare(
  toolDefinitions: ReadonlyArray<MockToolDefinition> = MOCK_TOOL_CATALOG,
): PaddingShareReport {
  const paddingSharesByDomain = new Map<MockToolDomainName, Array<number>>();
  for (const toolDefinition of toolDefinitions) {
    const domainShares = paddingSharesByDomain.get(toolDefinition.domainName) ?? [];
    domainShares.push(measurePaddingShare(toolDefinition));
    paddingSharesByDomain.set(toolDefinition.domainName, domainShares);
  }
  return {
    averagePaddingShare: averageOf(toolDefinitions.map(measurePaddingShare)),
    averagePaddingShareByDomain: new Map(
      [...paddingSharesByDomain].map(([domainName, domainShares]) => [
        domainName,
        averageOf(domainShares),
      ]),
    ),
  };
}
