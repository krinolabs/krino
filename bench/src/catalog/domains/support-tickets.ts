import {
  booleanParameter,
  type MockToolDefinition,
  stringParameter,
} from "../mock-tool-definition.js";
import { withDomainNote } from "../tool-description.js";

const TICKET_ID_DESCRIPTION = "Support ticket identifier, for example TCK-9001.";
const PRIORITY_VALUES = ["low", "normal", "high", "urgent"];

const DOMAIN_NOTE =
  "Support API: ticket IDs are TCK- plus digits; changes stay in ticket history. Max 45 calls per minute.";

export const SUPPORT_TICKET_TOOLS: Array<MockToolDefinition> = withDomainNote(DOMAIN_NOTE, [
  {
    toolName: "create_support_ticket",
    domainName: "supportTickets",
    coreDescription:
      "Opens a new support ticket for a customer with a subject, description and priority.",
    parameters: [
      stringParameter("customerId", "Customer identifier, for example CUS-5531."),
      stringParameter("subject", "One-line subject that support agents see in the queue."),
      stringParameter(
        "ticketDescription",
        "What happened, in plain text, with any order or payment identifiers.",
      ),
      stringParameter("priority", "How urgent the ticket is; urgent tickets are answered first.", {
        allowedValues: PRIORITY_VALUES,
      }),
    ],
    fixedResult: { ticketId: "TCK-9050", ticketStatus: "open" },
  },
  {
    toolName: "get_ticket_details",
    domainName: "supportTickets",
    coreDescription:
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
    coreDescription: "Changes the priority of a ticket.",
    parameters: [
      stringParameter("ticketId", TICKET_ID_DESCRIPTION),
      stringParameter("priority", "New priority for the ticket.", {
        allowedValues: PRIORITY_VALUES,
      }),
    ],
    fixedResult: { updated: true },
  },
  {
    toolName: "assign_ticket",
    domainName: "supportTickets",
    coreDescription: "Routes a ticket to a support team's queue.",
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
    coreDescription:
      "Escalates a ticket to on-call leadership and pages them; for incidents, data loss, or legal risk. Do not use it for routine routing to another team; use assign_ticket for that.",
    parameters: [
      stringParameter("ticketId", TICKET_ID_DESCRIPTION),
      stringParameter("escalationReason", "Why leadership must act now, in one or two sentences."),
    ],
    lookAlikeOf: "assign_ticket",
    fixedResult: { escalated: true, pagedRole: "supportLead" },
  },
  {
    toolName: "add_ticket_comment",
    domainName: "supportTickets",
    coreDescription:
      "Adds a comment to a ticket. Internal comments are seen only by staff; public ones are emailed to the customer.",
    parameters: [
      stringParameter("ticketId", TICKET_ID_DESCRIPTION),
      stringParameter("commentText", "The comment, in plain text, up to 5000 characters."),
      booleanParameter(
        "isInternal",
        "True for a staff-only comment; false emails it to the customer.",
      ),
    ],
    fixedResult: { commentId: "CMT-4410" },
  },
  {
    toolName: "send_customer_reply",
    domainName: "supportTickets",
    coreDescription:
      "Sends a reply to the customer on a ticket and sets the ticket to awaiting customer. Do not use it for staff-only notes; use add_ticket_comment with an internal comment for those.",
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
    coreDescription: "Closes a resolved ticket with a short resolution summary.",
    parameters: [
      stringParameter("ticketId", TICKET_ID_DESCRIPTION),
      stringParameter("resolutionSummary", "How the problem was solved, kept for future agents."),
    ],
    fixedResult: { ticketStatus: "closed" },
  },
  {
    toolName: "merge_tickets",
    domainName: "supportTickets",
    coreDescription:
      "Merges a duplicate ticket into a primary ticket, moving its comments, and closes the duplicate.",
    parameters: [
      stringParameter("primaryTicketId", "Identifier of the ticket to keep, for example TCK-9012."),
      stringParameter(
        "duplicateTicketId",
        "Identifier of the duplicate ticket to merge and close.",
      ),
    ],
    fixedResult: { merged: true },
  },
  {
    toolName: "search_tickets",
    domainName: "supportTickets",
    coreDescription:
      "Searches tickets by text in subject and comments, optionally for one customer.",
    parameters: [
      stringParameter("query", "Free text to match in ticket subjects and comments."),
      stringParameter("customerId", "Only return tickets of this customer, for example CUS-5531.", {
        isRequired: false,
      }),
    ],
    fixedResult: { matches: [{ ticketId: "TCK-9012", subject: "Package never arrived" }] },
  },
]);
