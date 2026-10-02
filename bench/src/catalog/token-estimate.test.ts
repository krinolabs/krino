import { describe, expect, it } from "vitest";
import { MOCK_TOOL_CATALOG } from "./mock-tool-catalog.js";
import {
  CHARACTERS_PER_TOKEN,
  estimateCatalogSize,
  measureDomainNoteShare,
  reportDomainNoteShare,
  serializeToolDefinition,
} from "./token-estimate.js";

describe("estimateCatalogSize", () => {
  it("puts the full catalog between 15,000 and 20,000 tokens (characters / 4)", () => {
    const catalogSize = estimateCatalogSize();
    expect(catalogSize.toolCount).toBe(100);
    expect(catalogSize.estimatedTokenCount).toBeGreaterThanOrEqual(15_000);
    expect(catalogSize.estimatedTokenCount).toBeLessThanOrEqual(20_000);
  });

  it("divides the serialized characters by four", () => {
    const catalogSize = estimateCatalogSize();
    expect(catalogSize.estimatedTokenCount).toBe(
      Math.round(catalogSize.characterCount / CHARACTERS_PER_TOKEN),
    );
  });

  it("counts name, description and input JSON Schema", () => {
    const firstTool = MOCK_TOOL_CATALOG[0];
    if (firstTool === undefined) {
      throw new Error("catalog is empty");
    }
    const serializedTool = JSON.parse(serializeToolDefinition(firstTool));
    expect(serializedTool.name).toBe(firstTool.toolName);
    expect(serializedTool.description).toBe(firstTool.toolDescription);
    expect(serializedTool.input_schema.type).toBe("object");
    expect(serializedTool.input_schema.$schema).toBeUndefined();
  });
});

describe("reportDomainNoteShare", () => {
  it("measures the domain note's share of one description", () => {
    const firstTool = MOCK_TOOL_CATALOG[0];
    if (firstTool === undefined) {
      throw new Error("catalog is empty");
    }
    const noteShare = measureDomainNoteShare({
      ...firstTool,
      toolDescription: "Core text.\n\nShared.",
      domainNote: "Shared.",
    });
    expect(noteShare).toBeCloseTo(7 / 19);
  });

  it("reports one average per domain", () => {
    const noteShareReport = reportDomainNoteShare();
    expect(noteShareReport.averageDomainNoteShareByDomain.size).toBe(10);
    expect(noteShareReport.averageDomainNoteShare).toBeGreaterThan(0);
  });

  it("keeps shared domain-note text at or below 35% of an average description", () => {
    expect(reportDomainNoteShare().averageDomainNoteShare).toBeLessThanOrEqual(0.35);
  });
});
