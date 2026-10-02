export { buildInputJsonSchema, buildInputSchema, buildInputShape } from "./catalog/input-schema.js";
export {
  findMockTool,
  hasMockTool,
  MOCK_TOOL_CATALOG,
  MOCK_TOOL_NAMES,
  toToolDescriptions,
} from "./catalog/mock-tool-catalog.js";
export {
  type JsonObject,
  type JsonValue,
  MOCK_TOOL_DOMAIN_NAMES,
  type MockToolDefinition,
  type MockToolDomainName,
  type MockToolDraft,
  type MockToolParameter,
  type MockToolParameterType,
} from "./catalog/mock-tool-definition.js";
export {
  type CatalogSizeEstimate,
  CHARACTERS_PER_TOKEN,
  type DomainNoteShareReport,
  estimateCatalogSize,
  measureDomainNoteShare,
  reportDomainNoteShare,
  serializeToolDefinition,
} from "./catalog/token-estimate.js";
export {
  buildParametersSection,
  composeToolDescription,
  withDomainNote,
} from "./catalog/tool-description.js";
export {
  executeMockTool,
  type MockToolExecutionFailed,
  type MockToolExecutionOutcome,
  type MockToolExecutionSucceeded,
} from "./executor/execute-mock-tool.js";
export { BENCH_TASKS, type BenchTask, type BenchTaskDifficulty } from "./tasks/bench-tasks.js";
