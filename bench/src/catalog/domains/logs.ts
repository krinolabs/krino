import {
  integerParameter,
  type MockToolDefinition,
  stringParameter,
  withDomainNote,
} from "../mock-tool-definition.js";

const SERVICE_NAME_DESCRIPTION = "Service name, for example checkout-service.";
const START_TIME_DESCRIPTION = "Start of the time range, ISO date-time in UTC.";
const END_TIME_DESCRIPTION = "End of the time range, ISO date-time in UTC.";

const DOMAIN_NOTE =
  "Observability API: times are ISO 8601 date-times in UTC. Ranges longer than 24 hours are rejected; narrow the range instead. Results are capped at 200 lines. Logs are redacted, so card numbers, tokens and passwords never appear.";

export const LOG_TOOLS: Array<MockToolDefinition> = withDomainNote(DOMAIN_NOTE, [
  {
    toolName: "search_application_logs",
    domainName: "logs",
    toolDescription:
      "Searches the application logs of a service for a text or request identifier within a time range. Returns matching lines with level and timestamp.",
    parameters: [
      stringParameter("serviceName", SERVICE_NAME_DESCRIPTION),
      stringParameter("query", "Text or request identifier to match."),
      stringParameter("startTime", START_TIME_DESCRIPTION),
      stringParameter("endTime", END_TIME_DESCRIPTION),
    ],
    fixedResult: {
      lines: [
        {
          level: "error",
          loggedAt: "2026-10-01T10:04:12Z",
          message: "card declined: do_not_honor",
        },
      ],
    },
  },
  {
    toolName: "search_audit_logs",
    domainName: "logs",
    toolDescription:
      "Searches the audit trail of who changed what in the admin system (prices, settings, permissions) for one resource. Do not use it for runtime errors or request debugging; use search_application_logs for that.",
    parameters: [
      stringParameter("resourceId", "Changed resource, for example PRD-77."),
      stringParameter("startTime", START_TIME_DESCRIPTION),
      stringParameter("endTime", END_TIME_DESCRIPTION),
      stringParameter("actorId", "Only changes made by this staff user.", { isRequired: false }),
    ],
    lookAlikeOf: "search_application_logs",
    fixedResult: {
      changes: [{ actorId: "STAFF-14", fieldName: "price", oldValue: "24.00", newValue: "19.00" }],
    },
  },
  {
    toolName: "get_error_rate",
    domainName: "logs",
    toolDescription:
      "Returns the percentage of failed requests for a service over the last N minutes, with the top error messages.",
    parameters: [
      stringParameter("serviceName", SERVICE_NAME_DESCRIPTION),
      integerParameter("windowInMinutes", "How many recent minutes to include."),
    ],
    fixedResult: { errorRatePercent: 7.4, topError: "payment gateway timeout" },
  },
  {
    toolName: "get_service_health",
    domainName: "logs",
    toolDescription:
      "Returns whether a service is up, degraded or down right now, from health checks. Do not use it for error percentages over time; use get_error_rate for that.",
    parameters: [stringParameter("serviceName", SERVICE_NAME_DESCRIPTION)],
    lookAlikeOf: "get_error_rate",
    fixedResult: { healthStatus: "degraded", lastCheckedAt: "2026-10-02T08:00:00Z" },
  },
  {
    toolName: "get_request_trace",
    domainName: "logs",
    toolDescription:
      "Returns the distributed trace of one request: every service it touched, with duration and status.",
    parameters: [stringParameter("requestId", "Request identifier, for example REQ-7f3a.")],
    fixedResult: {
      spans: [
        { serviceName: "checkout-service", durationInMilliseconds: 820, spanStatus: "error" },
        { serviceName: "payment-service", durationInMilliseconds: 790, spanStatus: "error" },
      ],
    },
  },
  {
    toolName: "get_webhook_delivery_log",
    domainName: "logs",
    toolDescription:
      "Returns recent delivery attempts to a webhook endpoint with HTTP status and response time.",
    parameters: [
      stringParameter("webhookEndpointId", "Endpoint identifier, for example WH-EP-3."),
      stringParameter("eventType", "Only this event type, for example order.created.", {
        isRequired: false,
      }),
    ],
    fixedResult: { attempts: [{ httpStatus: 503, attemptedAt: "2026-10-01T22:10:00Z" }] },
  },
  {
    toolName: "get_email_delivery_log",
    domainName: "logs",
    toolDescription:
      "Returns transactional emails sent to an address since a date, with delivery status (delivered, bounced, spam).",
    parameters: [
      stringParameter("emailAddress", "Recipient email address."),
      stringParameter("sinceDate", "Earliest send date, ISO date."),
    ],
    fixedResult: {
      emails: [{ templateName: "orderConfirmation", deliveryStatus: "bounced" }],
    },
  },
  {
    toolName: "get_job_run_log",
    domainName: "logs",
    toolDescription: "Returns the output and exit status of one scheduled job run on a date.",
    parameters: [
      stringParameter("jobName", "Scheduled job name, for example nightly-invoice-export."),
      stringParameter("runDate", "Run date, ISO date."),
    ],
    fixedResult: { exitStatus: "succeeded", durationInSeconds: 412 },
  },
  {
    toolName: "tail_service_logs",
    domainName: "logs",
    toolDescription:
      "Returns the most recent N log lines of a service with no filtering. Do not use it to find specific text or a time range; use search_application_logs for that.",
    parameters: [
      stringParameter("serviceName", SERVICE_NAME_DESCRIPTION),
      integerParameter("lineCount", "How many recent lines to return."),
    ],
    lookAlikeOf: "search_application_logs",
    fixedResult: { lines: ["INFO request served in 42 ms", "WARN retrying payment call"] },
  },
  {
    toolName: "export_logs",
    domainName: "logs",
    toolDescription:
      "Exports a service's logs for a time range to a downloadable file and returns its link.",
    parameters: [
      stringParameter("serviceName", SERVICE_NAME_DESCRIPTION),
      stringParameter("startTime", START_TIME_DESCRIPTION),
      stringParameter("endTime", END_TIME_DESCRIPTION),
      stringParameter("fileFormat", "File format.", { allowedValues: ["csv", "jsonl"] }),
    ],
    fixedResult: { exportId: "EXP-31", downloadPath: "exports/EXP-31.csv" },
  },
]);
