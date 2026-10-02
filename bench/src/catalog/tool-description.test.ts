import { describe, expect, it } from "vitest";
import { buildInputJsonSchema } from "./input-schema.js";
import { findMockTool, MOCK_TOOL_CATALOG } from "./mock-tool-catalog.js";
import {
  booleanParameter,
  integerParameter,
  type MockToolDefinition,
  type MockToolDraft,
  stringParameter,
} from "./mock-tool-definition.js";
import { buildParametersSection, composeToolDescription } from "./tool-description.js";

const CAMEL_CASE_IDENTIFIER = /\b[a-z]+(?:[A-Z][a-z0-9]*)+\b/g;

/** Names a description may use: the tool's own schema field names and allowed values. */
function collectSchemaIdentifiers(toolDefinition: MockToolDefinition): Set<string> {
  return new Set(
    toolDefinition.parameters.flatMap((parameter) => [
      parameter.parameterName,
      ...(parameter.allowedValues ?? []),
    ]),
  );
}

/** camelCase words in the description that the tool's input schema does not contain. */
function findUnknownIdentifiers(toolDefinition: MockToolDefinition): Array<string> {
  const schemaIdentifiers = collectSchemaIdentifiers(toolDefinition);
  const identifiers = toolDefinition.toolDescription.match(CAMEL_CASE_IDENTIFIER) ?? [];
  return identifiers.filter((identifier) => !schemaIdentifiers.has(identifier));
}

const SAMPLE_DRAFT: MockToolDraft = {
  toolName: "sample_tool",
  domainName: "orders",
  coreDescription: "Does the sample thing.",
  parameters: [
    stringParameter("orderId", "Order identifier, for example ORD-1."),
    stringParameter("sortOrder", "How to sort the rows.", {
      isRequired: false,
      allowedValues: ["newestFirst", "oldestFirst"],
    }),
    integerParameter("limit", "Maximum number of rows."),
    booleanParameter("includeNotes", "True to include notes.", { isRequired: false }),
  ],
  fixedResult: { ok: true },
};

describe("buildParametersSection", () => {
  it("lists each schema field with type, requirement, allowed values and description", () => {
    expect(buildParametersSection(SAMPLE_DRAFT)).toBe(
      [
        "Parameters:",
        "- orderId (string, required): Order identifier, for example ORD-1.",
        "- sortOrder (string, optional, one of newestFirst, oldestFirst): How to sort the rows.",
        "- limit (integer, required): Maximum number of rows.",
        "- includeNotes (boolean, optional): True to include notes.",
      ].join("\n"),
    );
  });

  it("says so when a tool takes no parameters", () => {
    expect(buildParametersSection({ parameters: [] })).toBe("Parameters: none.");
  });
});

describe("composeToolDescription", () => {
  it("joins core description, parameters section and domain note with blank lines", () => {
    expect(composeToolDescription(SAMPLE_DRAFT, "Orders API: a note.")).toBe(
      `Does the sample thing.\n\n${buildParametersSection(SAMPLE_DRAFT)}\n\nOrders API: a note.`,
    );
  });

  it("builds every catalog description from its three parts", () => {
    for (const toolDefinition of MOCK_TOOL_CATALOG) {
      expect(toolDefinition.toolDescription, toolDefinition.toolName).toBe(
        composeToolDescription(toolDefinition, toolDefinition.domainNote),
      );
    }
  });
});

describe("catalog descriptions", () => {
  it("give every schema field a .describe() text", () => {
    for (const toolDefinition of MOCK_TOOL_CATALOG) {
      const properties = buildInputJsonSchema(toolDefinition).properties ?? {};
      for (const [parameterName, propertySchema] of Object.entries(properties)) {
        const descriptionText =
          typeof propertySchema === "boolean" ? undefined : propertySchema.description;
        expect(
          descriptionText?.length,
          `${toolDefinition.toolName}.${parameterName}`,
        ).toBeGreaterThan(10);
      }
    }
  });

  it("only name camelCase identifiers that exist in the tool's own input schema", () => {
    for (const toolDefinition of MOCK_TOOL_CATALOG) {
      expect(findUnknownIdentifiers(toolDefinition), toolDefinition.toolName).toEqual([]);
    }
  });

  it("would catch a parameter the tool does not take", () => {
    const storeCreditTool = findMockTool("issue_store_credit");
    if (storeCreditTool === undefined) {
      throw new Error("issue_store_credit is missing");
    }
    const mismatchedTool = {
      ...storeCreditTool,
      toolDescription: `${storeCreditTool.toolDescription} Pass the refundId of the refund.`,
    };
    expect(findUnknownIdentifiers(mismatchedTool)).toEqual(["refundId"]);
  });
});
