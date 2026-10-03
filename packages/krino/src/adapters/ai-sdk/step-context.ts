import type { ModelMessage, ToolSet } from "ai";
import type { StepContext, ToolDescription } from "../../contracts/index.js";

/** The text parts of one message, joined. Tool calls, tool results and files are left out. */
export function messageText(message: ModelMessage): string {
  if (typeof message.content === "string") {
    return message.content;
  }
  const textParts: Array<string> = [];
  for (const contentPart of message.content) {
    if (contentPart.type === "text") {
      textParts.push(contentPart.text);
    }
  }
  return textParts.join("\n");
}

/** The task is the latest user message. */
export function taskTextFromMessages(messages: ReadonlyArray<ModelMessage>): string {
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex];
    if (message?.role === "user") {
      return messageText(message);
    }
  }
  return "";
}

/** `role: text` lines. The runtime trims them to the decision context budget. */
export function recentMessagesText(messages: ReadonlyArray<ModelMessage>): string {
  return messages
    .map((message) => ({ role: message.role, text: messageText(message) }))
    .filter((messageLine) => messageLine.text.length > 0)
    .map((messageLine) => `${messageLine.role}: ${messageLine.text}`)
    .join("\n");
}

export function describeTools(
  toolsByName: ReadonlyMap<string, ToolSet[string]>,
  toolNames: ReadonlyArray<string>,
): Array<ToolDescription> {
  return toolNames.map((toolName) => {
    // A description can be a function of the tool context; krino has no context, so it sends "".
    const description = toolsByName.get(toolName)?.description;
    return { toolName, toolDescription: typeof description === "string" ? description : "" };
  });
}

export function buildStepContext(stepContextInput: {
  runIdentifier: string;
  stepNumber: number;
  messages: ReadonlyArray<ModelMessage>;
  availableTools: Array<ToolDescription>;
}): StepContext {
  return {
    runIdentifier: stepContextInput.runIdentifier,
    stepNumber: stepContextInput.stepNumber,
    taskText: taskTextFromMessages(stepContextInput.messages),
    availableTools: stepContextInput.availableTools,
    recentMessagesText: recentMessagesText(stepContextInput.messages),
  };
}
