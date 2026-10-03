import type { HookCallbackMatcher, HookEvent } from "@anthropic-ai/claude-agent-sdk";

export type HookMatchersByEvent = Partial<Record<HookEvent, Array<HookCallbackMatcher>>>;

/**
 * The user's hooks with krino's `PreToolUse` matcher added last. Every user matcher keeps its
 * place and identity; other events pass through untouched. Never mutates the input.
 */
export function mergeHooks(
  userHooks: HookMatchersByEvent | undefined,
  krinoPreToolUseMatcher: HookCallbackMatcher,
): HookMatchersByEvent {
  return {
    ...userHooks,
    PreToolUse: [...(userHooks?.PreToolUse ?? []), krinoPreToolUseMatcher],
  };
}
