import { z } from "zod";
import type { MockToolDefinition, MockToolParameter } from "./mock-tool-definition.js";

export type MockToolInputShape = Record<string, z.ZodType>;

export type InputJsonSchema = z.core.JSONSchema.JSONSchema;

/** Anything with parameter specs: a finished tool or a draft in a domain file. */
type ParameterSource = Pick<MockToolDefinition, "parameters">;

function buildRequiredParameterSchema(parameter: MockToolParameter): z.ZodType {
  switch (parameter.parameterType) {
    case "string":
      return parameter.allowedValues === undefined ? z.string() : z.enum(parameter.allowedValues);
    case "integer":
      return z.number().int();
    case "number":
      return z.number();
    case "boolean":
      return z.boolean();
  }
}

function buildParameterSchema(parameter: MockToolParameter): z.ZodType {
  const requiredSchema = buildRequiredParameterSchema(parameter).describe(
    parameter.parameterDescription,
  );
  return parameter.isRequired ? requiredSchema : requiredSchema.optional();
}

/** A Zod raw shape: the form the Claude Agent SDK `tool()` helper takes. */
export function buildInputShape(parameterSource: ParameterSource): MockToolInputShape {
  const inputShape: MockToolInputShape = {};
  for (const parameter of parameterSource.parameters) {
    inputShape[parameter.parameterName] = buildParameterSchema(parameter);
  }
  return inputShape;
}

/** A Zod object schema: the form the AI SDK `tool()` helper takes. */
export function buildInputSchema(parameterSource: ParameterSource) {
  return z.object(buildInputShape(parameterSource));
}

/**
 * The JSON Schema the model sees, as AI SDK 7 sends a Zod 4 schema: draft-07, input side,
 * with `additionalProperties: false` added (the inputs are flat, so only the top level needs it).
 */
export function buildInputJsonSchema(parameterSource: ParameterSource): InputJsonSchema {
  const { $schema: _ignoredSchemaUri, ...jsonSchema } = z.toJSONSchema(
    buildInputSchema(parameterSource),
    { target: "draft-07", io: "input" },
  );
  return { ...jsonSchema, additionalProperties: false };
}
