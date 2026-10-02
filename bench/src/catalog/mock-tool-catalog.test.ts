import { describe, expect, it } from "vitest";
import {
  findMockTool,
  hasMockTool,
  MOCK_TOOL_CATALOG,
  toToolDescriptions,
} from "./mock-tool-catalog.js";
import { MOCK_TOOL_DOMAIN_NAMES } from "./mock-tool-definition.js";

const PROTOTYPE_KEY_NAMES = ["constructor", "toString", "__proto__", "hasOwnProperty"];

describe("MOCK_TOOL_CATALOG", () => {
  it("has 100 tools with unique names", () => {
    const toolNames = MOCK_TOOL_CATALOG.map((toolDefinition) => toolDefinition.toolName);
    expect(toolNames).toHaveLength(100);
    expect(new Set(toolNames).size).toBe(100);
  });

  it("uses tool names that every host accepts", () => {
    for (const toolDefinition of MOCK_TOOL_CATALOG) {
      expect(toolDefinition.toolName).toMatch(/^[a-z][a-z0-9_]{0,63}$/);
    }
  });

  it.each(MOCK_TOOL_DOMAIN_NAMES)("has 10 tools in the %s domain", (domainName) => {
    const domainTools = MOCK_TOOL_CATALOG.filter(
      (toolDefinition) => toolDefinition.domainName === domainName,
    );
    expect(domainTools).toHaveLength(10);
  });

  it.each(MOCK_TOOL_DOMAIN_NAMES)("has 2 or 3 look-alike tools in the %s domain", (domainName) => {
    const lookAlikeTools = MOCK_TOOL_CATALOG.filter(
      (toolDefinition) =>
        toolDefinition.domainName === domainName && toolDefinition.lookAlikeOf !== undefined,
    );
    expect(lookAlikeTools.length).toBeGreaterThanOrEqual(2);
    expect(lookAlikeTools.length).toBeLessThanOrEqual(3);
  });

  it("points every look-alike at a different tool in the same domain", () => {
    for (const toolDefinition of MOCK_TOOL_CATALOG) {
      if (toolDefinition.lookAlikeOf === undefined) {
        continue;
      }
      const originalTool = findMockTool(toolDefinition.lookAlikeOf);
      expect(originalTool, toolDefinition.toolName).toBeDefined();
      expect(originalTool?.domainName).toBe(toolDefinition.domainName);
      expect(toolDefinition.lookAlikeOf).not.toBe(toolDefinition.toolName);
    }
  });

  it("says in each look-alike description when not to use it and what to use instead", () => {
    for (const toolDefinition of MOCK_TOOL_CATALOG) {
      if (toolDefinition.lookAlikeOf === undefined) {
        continue;
      }
      expect(toolDefinition.toolDescription, toolDefinition.toolName).toContain("Do not use");
      expect(toolDefinition.toolDescription, toolDefinition.toolName).toContain(
        toolDefinition.lookAlikeOf,
      );
    }
  });

  it("describes every tool and parameter", () => {
    for (const toolDefinition of MOCK_TOOL_CATALOG) {
      expect(toolDefinition.toolDescription.length).toBeGreaterThan(40);
      expect(Object.keys(toolDefinition.fixedResult).length).toBeGreaterThan(0);
      const parameterNames = toolDefinition.parameters.map((parameter) => parameter.parameterName);
      expect(new Set(parameterNames).size, toolDefinition.toolName).toBe(parameterNames.length);
      for (const parameter of toolDefinition.parameters) {
        expect(parameter.parameterDescription.length).toBeGreaterThan(0);
        if (parameter.allowedValues !== undefined) {
          expect(parameter.parameterType).toBe("string");
          expect(parameter.allowedValues.length).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe("findMockTool and hasMockTool", () => {
  it("find a catalog tool by name", () => {
    expect(findMockTool("get_order_status")?.domainName).toBe("orders");
    expect(hasMockTool("get_order_status")).toBe(true);
  });

  it.each(PROTOTYPE_KEY_NAMES)("do not treat %s as a tool", (toolName) => {
    expect(findMockTool(toolName)).toBeUndefined();
    expect(hasMockTool(toolName)).toBe(false);
  });
});

describe("toToolDescriptions", () => {
  it("maps the catalog to krino tool descriptions in catalog order", () => {
    const toolDescriptions = toToolDescriptions();
    expect(toolDescriptions).toHaveLength(100);
    expect(toolDescriptions[0]).toEqual({
      toolName: MOCK_TOOL_CATALOG[0]?.toolName,
      toolDescription: MOCK_TOOL_CATALOG[0]?.toolDescription,
    });
  });
});
