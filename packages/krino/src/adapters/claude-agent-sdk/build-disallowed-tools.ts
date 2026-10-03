export type DisallowedToolsInput = {
  userDisallowedTools: ReadonlyArray<string> | undefined;
  /** The tools krino was told about. Only these can be added. */
  knownToolNames: ReadonlyArray<string>;
  suggestedToolNames: ReadonlyArray<string>;
};

/**
 * Enforce mode's tool pruning: the user's `disallowedTools`, unchanged and first, plus every known
 * tool that was not suggested. It never adds a tool krino does not know (such as a built-in tool),
 * and it never reads or changes `allowedTools`: krino changes availability, not approval.
 */
export function buildDisallowedTools(disallowedToolsInput: DisallowedToolsInput): Array<string> {
  const userDisallowedTools = disallowedToolsInput.userDisallowedTools ?? [];
  const suggestedToolNameSet = new Set(disallowedToolsInput.suggestedToolNames);
  const disallowedToolNameSet = new Set(userDisallowedTools);
  const disallowedTools = [...userDisallowedTools];
  for (const knownToolName of disallowedToolsInput.knownToolNames) {
    if (suggestedToolNameSet.has(knownToolName) || disallowedToolNameSet.has(knownToolName)) {
      continue;
    }
    disallowedToolNameSet.add(knownToolName);
    disallowedTools.push(knownToolName);
  }
  return disallowedTools;
}
