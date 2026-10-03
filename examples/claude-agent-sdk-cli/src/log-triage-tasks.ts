import { BENCH_TASKS } from "@krinolabs/bench";

// The tasks `--task` accepts: bench tasks, with the tool calls and answer `--fake` plays back.

export type ScriptedToolCall = { toolName: string; toolInput: Record<string, string> };

export type ExampleTask = {
  /** The bench task identifier, used by `--task`. */
  taskIdentifier: string;
  /** For `--help`. */
  summary: string;
  /** What `--fake` calls, in order: the bench task's expected tools. */
  scriptedToolCalls: ReadonlyArray<ScriptedToolCall>;
  scriptedAnswer: string;
};

export type ResolvedExampleTask = ExampleTask & {
  /** The user message, from the bench task. */
  taskText: string;
  /** From the bench task. Every `--tools` size includes them. */
  expectedToolNames: ReadonlyArray<string>;
};

export const EXAMPLE_TASKS: ReadonlyArray<ExampleTask> = [
  {
    taskIdentifier: "task-059",
    summary: "find why request REQ-7f3a failed (read-only tools)",
    scriptedToolCalls: [
      { toolName: "get_request_trace", toolInput: { requestId: "REQ-7f3a" } },
      {
        toolName: "search_application_logs",
        toolInput: {
          serviceName: "payment-service",
          query: "REQ-7f3a",
          startTime: "2026-10-01T10:00:00Z",
          endTime: "2026-10-01T10:15:00Z",
        },
      },
    ],
    scriptedAnswer:
      "REQ-7f3a failed in payment-service: the card was declined (do_not_honor), and " +
      "checkout-service passed the error on. No service is down; ask the customer to try " +
      "another card.",
  },
  {
    taskIdentifier: "task-052",
    summary: "check a failing webhook, then open a ticket (calls a write tool)",
    scriptedToolCalls: [
      {
        toolName: "get_webhook_delivery_log",
        toolInput: { webhookEndpointId: "WH-EP-3", eventType: "order.created" },
      },
      {
        toolName: "create_support_ticket",
        toolInput: {
          customerId: "CUS-5800",
          subject: "Webhook WH-EP-3 is failing",
          ticketDescription: "order.created deliveries to WH-EP-3 return HTTP 503.",
          priority: "high",
        },
      },
    ],
    scriptedAnswer:
      "Deliveries to WH-EP-3 fail with HTTP 503, so the customer's endpoint is down. " +
      "I opened a high priority ticket for CUS-5800.",
  },
];

export const DEFAULT_TASK_IDENTIFIER = "task-059";

export const TASK_IDENTIFIERS: ReadonlyArray<string> = EXAMPLE_TASKS.map(
  (exampleTask) => exampleTask.taskIdentifier,
);

/** The example task with its bench text and tools. Throws on an identifier `--task` rejects. */
export function resolveExampleTask(taskIdentifier: string): ResolvedExampleTask {
  const exampleTask = EXAMPLE_TASKS.find((task) => task.taskIdentifier === taskIdentifier);
  const benchTask = BENCH_TASKS.find((task) => task.taskIdentifier === taskIdentifier);
  if (exampleTask === undefined || benchTask === undefined) {
    throw new Error(`Unknown example task: ${taskIdentifier}`);
  }
  return {
    ...exampleTask,
    taskText: benchTask.taskText,
    expectedToolNames: benchTask.expectedToolNames,
  };
}
