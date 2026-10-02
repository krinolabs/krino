import type { ToolExecutionOptions, ToolSet } from "ai";

export type ToolCallNotice = {
  toolName: string;
  toolInput: unknown;
  toolCallId: string;
};

type ExecuteFunction = (
  toolInput: unknown,
  executionOptions: ToolExecutionOptions<unknown>,
) => unknown;

/**
 * Copies the tool set and wraps each `execute` so krino hears about the call first. The wrapper
 * returns exactly what the original returns (a value, a promise or an AsyncIterable), so the
 * host behaves as before. The caller's tool objects are never changed. Tools without `execute`
 * pass through as the same object.
 */
export function wrapToolsForRiskGate(
  toolsByName: ReadonlyMap<string, ToolSet[string]>,
  onToolCall: (toolCallNotice: ToolCallNotice) => void,
): ToolSet {
  const wrappedEntries = [...toolsByName].map(([toolName, toolEntry]) => {
    if (typeof toolEntry.execute !== "function") {
      return [toolName, toolEntry] as const;
    }
    // Tool inputs are typed per tool; the wrapper only passes them through.
    const originalExecute = toolEntry.execute as ExecuteFunction;
    const wrappedExecute: ExecuteFunction = (toolInput, executionOptions) => {
      try {
        onToolCall({ toolName, toolInput, toolCallId: executionOptions.toolCallId });
      } catch {
        // Never let krino stop a tool call.
      }
      return originalExecute.call(toolEntry, toolInput, executionOptions);
    };
    const wrappedTool: ToolSet[string] = Object.assign(
      Object.create(Object.getPrototypeOf(toolEntry)),
      toolEntry,
      { execute: wrappedExecute },
    );
    return [toolName, wrappedTool] as const;
  });
  // fromEntries defines own properties, so a tool named "__proto__" stays a plain key.
  return Object.fromEntries(wrappedEntries);
}
