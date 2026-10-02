import type { StepContext } from "../contracts/index.js";
import { KRINO_CONFIG_DEFAULTS } from "../contracts/index.js";

/** Stands in for removed user content. */
export const REDACTED_TEXT = "[redacted]";

export type RedactionOptions = {
  /** Default `true` (`KRINO_CONFIG_DEFAULTS.redactContent`). */
  redactContent?: boolean;
};

function redactText(text: string): string {
  return text === "" ? "" : REDACTED_TEXT;
}

/**
 * Returns a copy of the step context that is safe to store: the task text and recent messages
 * are replaced with `[redacted]`. Tool names and descriptions come from the developer, not the
 * user, so they stay. With `redactContent: false` the copy keeps the raw text.
 */
export function redactStepContext(
  stepContext: StepContext,
  redactionOptions: RedactionOptions = {},
): StepContext {
  const redactContent = redactionOptions.redactContent ?? KRINO_CONFIG_DEFAULTS.redactContent;
  const availableTools = stepContext.availableTools.map((toolDescription) => ({
    ...toolDescription,
  }));
  if (!redactContent) {
    return { ...stepContext, availableTools };
  }
  return {
    ...stepContext,
    taskText: redactText(stepContext.taskText),
    recentMessagesText: redactText(stepContext.recentMessagesText),
    availableTools,
  };
}
