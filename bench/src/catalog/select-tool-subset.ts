import { findMockTool, MOCK_TOOL_CATALOG } from "./mock-tool-catalog.js";
import type { MockToolDomainName } from "./mock-tool-definition.js";

export type ToolSubsetOptions = {
  /** How many tool names to return: 1 to the catalog size. */
  toolCount: number;
  /** Tools the task needs. Always in the result, first, in this order. Repeats count once. */
  requiredToolNames: ReadonlyArray<string>;
};

/** Tool names per domain, in catalog order. Domains in the order they first appear. */
function toolNamesByDomain(): Map<MockToolDomainName, Array<string>> {
  const domainToolNames = new Map<MockToolDomainName, Array<string>>();
  for (const toolDefinition of MOCK_TOOL_CATALOG) {
    const toolNames = domainToolNames.get(toolDefinition.domainName) ?? [];
    toolNames.push(toolDefinition.toolName);
    domainToolNames.set(toolDefinition.domainName, toolNames);
  }
  return domainToolNames;
}

function validateSubsetOptions(toolCount: number, requiredToolNames: Array<string>): void {
  if (!Number.isInteger(toolCount) || toolCount < 1) {
    throw new Error(`toolCount must be a positive whole number; got ${toolCount}.`);
  }
  const unknownToolNames = requiredToolNames.filter(
    (toolName) => findMockTool(toolName) === undefined,
  );
  if (unknownToolNames.length > 0) {
    throw new Error(`Required tools not in the catalog: ${unknownToolNames.join(", ")}`);
  }
  if (toolCount < requiredToolNames.length) {
    throw new Error(
      `toolCount ${toolCount} is less than the ${requiredToolNames.length} required tools.`,
    );
  }
  if (toolCount > MOCK_TOOL_CATALOG.length) {
    throw new Error(
      `toolCount ${toolCount} is more than the ${MOCK_TOOL_CATALOG.length} tools in the catalog.`,
    );
  }
}

/**
 * A deterministic slice of the catalog for scaling checks (10 / 25 / 50 / 100 tools):
 * 1. the required tools, in the given order;
 * 2. the rest of the required tools' domains (look-alikes included), in catalog order;
 * 3. the other domains round-robin, one tool per domain per round, in catalog order.
 * Throws on a bad `toolCount` or a required name that is not in the catalog.
 */
export function selectToolSubset(subsetOptions: ToolSubsetOptions): Array<string> {
  const requiredToolNames = [...new Set(subsetOptions.requiredToolNames)];
  const { toolCount } = subsetOptions;
  validateSubsetOptions(toolCount, requiredToolNames);

  const selectedToolNames = new Set(requiredToolNames);
  const addUntilFull = (toolName: string): void => {
    if (selectedToolNames.size < toolCount) {
      selectedToolNames.add(toolName);
    }
  };

  const domainToolNames = toolNamesByDomain();
  const requiredDomainNames = new Set(
    requiredToolNames.flatMap((toolName) => findMockTool(toolName)?.domainName ?? []),
  );
  for (const toolDefinition of MOCK_TOOL_CATALOG) {
    if (requiredDomainNames.has(toolDefinition.domainName)) {
      addUntilFull(toolDefinition.toolName);
    }
  }

  const otherDomainToolNames = [...domainToolNames.entries()]
    .filter(([domainName]) => !requiredDomainNames.has(domainName))
    .map(([, toolNames]) => toolNames);
  const longestDomainLength = Math.max(0, ...otherDomainToolNames.map((names) => names.length));
  for (let roundIndex = 0; roundIndex < longestDomainLength; roundIndex += 1) {
    for (const toolNames of otherDomainToolNames) {
      const toolName = toolNames[roundIndex];
      if (toolName !== undefined) {
        addUntilFull(toolName);
      }
    }
  }

  return [...selectedToolNames];
}
