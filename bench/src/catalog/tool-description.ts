import { buildInputJsonSchema, type InputJsonSchema } from "./input-schema.js";
import type { MockToolDefinition, MockToolDraft } from "./mock-tool-definition.js";

function describeSchemaType(propertySchema: InputJsonSchema): string {
  const schemaType = propertySchema.type;
  if (Array.isArray(schemaType)) {
    return schemaType.join(" or ");
  }
  return schemaType ?? "any";
}

function describeAllowedValues(propertySchema: InputJsonSchema): string {
  const allowedValues = propertySchema.enum;
  return Array.isArray(allowedValues) && allowedValues.length > 0
    ? `, one of ${allowedValues.map(String).join(", ")}`
    : "";
}

/**
 * The "Parameters:" section, generated from the tool's own Zod input schema (through the
 * JSON Schema the model receives): name, type, required or optional, allowed values, and the
 * field's `.describe()` text. One line per field, in schema order.
 */
export function buildParametersSection(toolDraft: Pick<MockToolDraft, "parameters">): string {
  const inputJsonSchema = buildInputJsonSchema(toolDraft);
  const requiredNames = new Set(inputJsonSchema.required ?? []);
  const parameterLines = Object.entries(inputJsonSchema.properties ?? {}).map(
    ([parameterName, propertySchema]) => {
      if (typeof propertySchema === "boolean") {
        return `- ${parameterName}`;
      }
      const requirement = requiredNames.has(parameterName) ? "required" : "optional";
      const typeText = `${describeSchemaType(propertySchema)}, ${requirement}${describeAllowedValues(propertySchema)}`;
      const descriptionText = propertySchema.description ?? "";
      return `- ${parameterName} (${typeText}): ${descriptionText}`.trimEnd();
    },
  );
  return parameterLines.length === 0
    ? "Parameters: none."
    : ["Parameters:", ...parameterLines].join("\n");
}

/** core description, generated Parameters section, domain note: separated by blank lines. */
export function composeToolDescription(toolDraft: MockToolDraft, domainNote: string): string {
  return [toolDraft.coreDescription, buildParametersSection(toolDraft), domainNote].join("\n\n");
}

/** Finishes a domain's drafts: adds the domain note and composes each description. */
export function withDomainNote(
  domainNote: string,
  toolDrafts: Array<MockToolDraft>,
): Array<MockToolDefinition> {
  return toolDrafts.map((toolDraft) => ({
    ...toolDraft,
    domainNote,
    toolDescription: composeToolDescription(toolDraft, domainNote),
  }));
}
