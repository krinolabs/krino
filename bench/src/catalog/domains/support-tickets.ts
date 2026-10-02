import {
  booleanParameter,
  type MockToolDefinition,
  stringParameter,
  withDomainNote,
} from "../mock-tool-definition.js";

const TICKET_ID_DESCRIPTION = "Support ticket identifier, for example TCK-9001.";
const PRIORITY_VALUES = ["low", "normal", "high", "urgent"];

const DOMAIN_NOTE =
  "Parameters: ticketId is TCK- plus digits; priority is low, normal, high or urgent. Limits: public text is emailed to the customer exactly as written, so keep internal details out; 30 writes per minute. Example: TCK-9001 is valid, TCK9001 is rejected.";

export const SUPPORT_TICKET_TOOLS: Array<MockToolDefinition> = withDomainNote(DOMAIN_NOTE, [
  {
    toolName: "create_support_ticket",
    domainName: "supportTickets",
    toolDescription:
      "Opens a new support ticket for a customer with a subject, description and priority.",
    parameters: [
      stringParameter("customerId", "Customer identifier, for example CUS-5531."),
      stringParameter("subject", "One-line subject."),
      stringParameter("ticketDescription", "What happened, in plain text."),
      stringParameter("priority", "How urgent the ticket is.", { allowedValues: PRIORITY_VALUES }),
    ],
    fixedResult: { ticketId: "TCK-9050", ticketStatus: "open" },
  },
  {
    toolName: "get_ticket_details",
    domainName: "supportTickets",
    toolDescription:
      "Returns a ticket with subject, status, priority, assigned team, and the full comment thread.",
    parameters: [stringParameter("ticketId", TICKET_ID_DESCRIPTION)],
    fixedResult: {
      subject: "Checkout keeps failing",
      ticketStatus: "open",
      priority: "high",
      assignedTeam: "payments",
    },
  },
  {
    toolName: "update_ticket_priority",
    domainName: "supportTickets",
    toolDescription: "Changes the priority of a ticket.",
    parameters: [
      stringParameter("ticketId", TICKET_ID_DESCRIPTION),
      stringParameter("priority", "New priority.", { allowedValues: PRIORITY_VALUES }),
    ],
    fixedResult: { updated: true },
  },
  {
    toolName: "assign_ticket",
    domainName: "supportTickets",
    toolDescription: "Routes a ticket to a support team's queue.",
    parameters: [
      stringParameter("ticketId", TICKET_ID_DESCRIPTION),
      stringParameter("teamName", "Team that should handle the ticket.", {
        allowedValues: ["general", "billing", "shipping", "payments", "engineering"],
      }),
    ],
    fixedResult: { assigned: true },
  },
  {
    toolName: "escalate_ticket",
    domainName: "supportTickets",
    toolDescription:
      "Escalates a ticket to on-call leadership and pages them; for incidents, data loss, or legal risk. Do not use it for routine routing to another team; use assign_ticket for that.",
    parameters: [
      stringParameter("ticketId", TICKET_ID_DESCRIPTION),
      stringParameter("escalationReason", "Why leadership must act now."),
    ],
    lookAlikeOf: "assign_ticket",
    fixedResult: { escalated: true, pagedRole: "supportLead" },
  },
  {
    toolName: "add_ticket_comment",
    domainName: "supportTickets",
    toolDescription:
      "Adds a comment to a ticket. Internal comments are seen only by staff; public ones are emailed to the customer.",
    parameters: [
      stringParameter("ticketId", TICKET_ID_DESCRIPTION),
      stringParameter("commentText", "The comment, in plain text."),
      booleanParameter("isInternal", "True for a staff-only comment."),
    ],
    fixedResult: { commentId: "CMT-4410" },
  },
  {
    toolName: "send_customer_reply",
    domainName: "supportTickets",
    toolDescription:
      "Sends a reply to the customer on a ticket and sets the ticket to awaitingCustomer. Do not use it for staff-only notes; use add_ticket_comment with isInternal set to true for those.",
    parameters: [
      stringParameter("ticketId", TICKET_ID_DESCRIPTION),
      stringParameter("replyText", "The message the customer receives."),
    ],
    lookAlikeOf: "add_ticket_comment",
    fixedResult: { sent: true, ticketStatus: "awaitingCustomer" },
  },
  {
    toolName: "close_ticket",
    domainName: "supportTickets",
    toolDescription: "Closes a resolved ticket with a short resolution summary.",
    parameters: [
      stringParameter("ticketId", TICKET_ID_DESCRIPTION),
      stringParameter("resolutionSummary", "How the problem was solved."),
    ],
    fixedResult: { ticketStatus: "closed" },
  },
  {
    toolName: "merge_tickets",
    domainName: "supportTickets",
    toolDescription:
      "Merges a duplicate ticket into a primary ticket, moving its comments, and closes the duplicate.",
    parameters: [
      stringParameter("primaryTicketId", "Ticket to keep."),
      stringParameter("duplicateTicketId", "Ticket to merge and close."),
    ],
    fixedResult: { merged: true },
  },
  {
    toolName: "search_tickets",
    domainName: "supportTickets",
    toolDescription:
      "Searches tickets by text in subject and comments, optionally for one customer.",
    parameters: [
      stringParameter("query", "Free text to match."),
      stringParameter("customerId", "Only tickets of this customer.", { isRequired: false }),
    ],
    fixedResult: { matches: [{ ticketId: "TCK-9012", subject: "Package never arrived" }] },
  },
]);
