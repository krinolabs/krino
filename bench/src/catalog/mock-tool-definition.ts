export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | Array<JsonValue> | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

export const MOCK_TOOL_DOMAIN_NAMES = [
  "orders",
  "refunds",
  "shipping",
  "coupons",
  "customers",
  "inventory",
  "payments",
  "returns",
  "supportTickets",
  "logs",
] as const;

export type MockToolDomainName = (typeof MOCK_TOOL_DOMAIN_NAMES)[number];

export type MockToolParameterType = "string" | "integer" | "number" | "boolean";

export type MockToolParameter = {
  parameterName: string;
  parameterType: MockToolParameterType;
  parameterDescription: string;
  isRequired: boolean;
  /** Only for `string` parameters: the input must be one of these values. */
  allowedValues?: Array<string>;
};

export type MockToolDefinition = {
  toolName: string;
  domainName: MockToolDomainName;
  /** Sent to the model. Look-alike pairs say when *not* to use the tool. */
  toolDescription: string;
  parameters: Array<MockToolParameter>;
  /** Set on a look-alike tool: the name of the tool it is easily confused with. */
  lookAlikeOf?: string;
  /** The fake executor returns this, plus the parsed input and a digest of it. */
  fixedResult: JsonObject;
};

/**
 * Appends the domain's API note (identifier formats, units, scopes) to each description,
 * the way real tool catalogs repeat their API conventions on every tool.
 */
export function withDomainNote(
  domainNote: string,
  toolDefinitions: Array<MockToolDefinition>,
): Array<MockToolDefinition> {
  return toolDefinitions.map((toolDefinition) => ({
    ...toolDefinition,
    toolDescription: `${toolDefinition.toolDescription} ${domainNote}`,
  }));
}

type ParameterOptions = {
  isRequired?: boolean;
  allowedValues?: Array<string>;
};

function buildParameter(
  parameterName: string,
  parameterType: MockToolParameterType,
  parameterDescription: string,
  parameterOptions: ParameterOptions,
): MockToolParameter {
  const parameter: MockToolParameter = {
    parameterName,
    parameterType,
    parameterDescription,
    isRequired: parameterOptions.isRequired ?? true,
  };
  if (parameterOptions.allowedValues !== undefined) {
    parameter.allowedValues = parameterOptions.allowedValues;
  }
  return parameter;
}

export function stringParameter(
  parameterName: string,
  parameterDescription: string,
  parameterOptions: ParameterOptions = {},
): MockToolParameter {
  return buildParameter(parameterName, "string", parameterDescription, parameterOptions);
}

export function integerParameter(
  parameterName: string,
  parameterDescription: string,
  parameterOptions: Omit<ParameterOptions, "allowedValues"> = {},
): MockToolParameter {
  return buildParameter(parameterName, "integer", parameterDescription, parameterOptions);
}

export function numberParameter(
  parameterName: string,
  parameterDescription: string,
  parameterOptions: Omit<ParameterOptions, "allowedValues"> = {},
): MockToolParameter {
  return buildParameter(parameterName, "number", parameterDescription, parameterOptions);
}

export function booleanParameter(
  parameterName: string,
  parameterDescription: string,
  parameterOptions: Omit<ParameterOptions, "allowedValues"> = {},
): MockToolParameter {
  return buildParameter(parameterName, "boolean", parameterDescription, parameterOptions);
}
