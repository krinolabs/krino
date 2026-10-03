import { describe, expect, it } from "vitest";
import { findMockTool, MOCK_TOOL_NAMES } from "./mock-tool-catalog.js";
import { selectToolSubset } from "./select-tool-subset.js";

const LOG_TRIAGE_TOOL_NAMES = ["get_request_trace", "search_application_logs"];

function domainOf(toolName: string): string | undefined {
  return findMockTool(toolName)?.domainName;
}

describe("selectToolSubset", () => {
  it.each([10, 25, 50, 100])("returns %i tool names", (toolCount) => {
    const toolNames = selectToolSubset({ toolCount, requiredToolNames: LOG_TRIAGE_TOOL_NAMES });
    expect(toolNames).toHaveLength(toolCount);
  });

  it.each([2, 10, 25, 50, 100])(
    "includes every required tool, without duplicates, at size %i",
    (toolCount) => {
      const toolNames = selectToolSubset({ toolCount, requiredToolNames: LOG_TRIAGE_TOOL_NAMES });
      expect(toolNames).toEqual(expect.arrayContaining(LOG_TRIAGE_TOOL_NAMES));
      expect(new Set(toolNames).size).toBe(toolNames.length);
      for (const toolName of toolNames) {
        expect(MOCK_TOOL_NAMES).toContain(toolName);
      }
    },
  );

  it("puts the required tools first, in the given order", () => {
    const toolNames = selectToolSubset({ toolCount: 25, requiredToolNames: LOG_TRIAGE_TOOL_NAMES });
    expect(toolNames.slice(0, 2)).toEqual(LOG_TRIAGE_TOOL_NAMES);
  });

  it("fills a logs task of size 10 with the logs domain only, look-alikes included", () => {
    const toolNames = selectToolSubset({ toolCount: 10, requiredToolNames: LOG_TRIAGE_TOOL_NAMES });
    expect(toolNames.map(domainOf)).toEqual(Array(10).fill("logs"));
    expect(toolNames).toContain("search_audit_logs");
    expect(toolNames).toContain("get_service_health");
  });

  it("puts every same-domain tool before any other domain", () => {
    const toolNames = selectToolSubset({ toolCount: 50, requiredToolNames: LOG_TRIAGE_TOOL_NAMES });
    const domainNames = toolNames.map(domainOf);
    expect(domainNames.slice(0, 10)).toEqual(Array(10).fill("logs"));
    expect(domainNames.slice(10)).not.toContain("logs");
  });

  it("fills the same domain in catalog order after the required tools", () => {
    const toolNames = selectToolSubset({ toolCount: 10, requiredToolNames: LOG_TRIAGE_TOOL_NAMES });
    const logToolsInCatalogOrder = MOCK_TOOL_NAMES.filter(
      (toolName) => domainOf(toolName) === "logs" && !LOG_TRIAGE_TOOL_NAMES.includes(toolName),
    );
    expect(toolNames.slice(2)).toEqual(logToolsInCatalogOrder);
  });

  it("fills the other domains round-robin, one tool per domain per round", () => {
    const toolNames = selectToolSubset({ toolCount: 28, requiredToolNames: LOG_TRIAGE_TOOL_NAMES });
    const otherDomainNames = toolNames.slice(10).map(domainOf);
    const firstRound = otherDomainNames.slice(0, 9);
    const secondRound = otherDomainNames.slice(9, 18);
    expect(new Set(firstRound).size).toBe(9);
    expect(secondRound).toEqual(firstRound);
    // Each domain's first tool in catalog order comes in the first round.
    for (const toolName of toolNames.slice(10, 19)) {
      const domainName = domainOf(toolName);
      const firstToolOfDomain = MOCK_TOOL_NAMES.find(
        (catalogToolName) => domainOf(catalogToolName) === domainName,
      );
      expect(toolName).toBe(firstToolOfDomain);
    }
  });

  it("spreads required tools from two domains: both domains fill first", () => {
    const requiredToolNames = ["get_webhook_delivery_log", "create_support_ticket"];
    const toolNames = selectToolSubset({ toolCount: 20, requiredToolNames });
    expect(new Set(toolNames.map(domainOf))).toEqual(new Set(["logs", "supportTickets"]));
  });

  it("returns the same array for the same input", () => {
    const subsetOptions = { toolCount: 50, requiredToolNames: LOG_TRIAGE_TOOL_NAMES };
    expect(selectToolSubset(subsetOptions)).toEqual(selectToolSubset(subsetOptions));
  });

  it("works with no required tools", () => {
    const toolNames = selectToolSubset({ toolCount: 10, requiredToolNames: [] });
    expect(new Set(toolNames.map(domainOf)).size).toBe(10);
  });

  it("counts a repeated required name once", () => {
    const toolNames = selectToolSubset({
      toolCount: 3,
      requiredToolNames: ["get_request_trace", "get_request_trace"],
    });
    expect(toolNames).toHaveLength(3);
    expect(new Set(toolNames).size).toBe(3);
  });

  it("throws when toolCount is below the number of required tools", () => {
    expect(() =>
      selectToolSubset({ toolCount: 1, requiredToolNames: LOG_TRIAGE_TOOL_NAMES }),
    ).toThrow("toolCount 1 is less than the 2 required tools");
  });

  it("throws when toolCount is above the catalog size", () => {
    expect(() =>
      selectToolSubset({ toolCount: 101, requiredToolNames: LOG_TRIAGE_TOOL_NAMES }),
    ).toThrow("toolCount 101 is more than the 100 tools in the catalog");
  });

  it.each([0, -1, 2.5, Number.NaN])("throws when toolCount is %s", (toolCount) => {
    expect(() => selectToolSubset({ toolCount, requiredToolNames: [] })).toThrow(
      "toolCount must be a positive whole number",
    );
  });

  it.each(["constructor", "toString", "__proto__", "no_such_tool"])(
    "throws when a required name (%s) is not in the catalog",
    (unknownToolName) => {
      expect(() =>
        selectToolSubset({ toolCount: 10, requiredToolNames: [unknownToolName] }),
      ).toThrow(`Required tools not in the catalog: ${unknownToolName}`);
    },
  );
});
