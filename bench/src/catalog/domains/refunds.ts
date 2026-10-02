import {
  integerParameter,
  type MockToolDefinition,
  stringParameter,
  withDomainNote,
} from "../mock-tool-definition.js";

const REFUND_ID_DESCRIPTION = "Refund identifier, for example RF-2201.";
const ORDER_ID_DESCRIPTION = "Order identifier, for example ORD-10422.";

const DOMAIN_NOTE =
  "Refunds API: refund identifiers look like RF- followed by digits. Amounts are integers in cents and may not exceed what was captured for the order. Refunds over 500 USD wait for manager approval. Any change needs the refunds:write scope.";

export const REFUND_TOOLS: Array<MockToolDefinition> = withDomainNote(DOMAIN_NOTE, [
  {
    toolName: "create_refund",
    domainName: "refunds",
    toolDescription:
      "Refunds money for an order back to the original payment method (card or wallet). Use it when the customer wants their money back. Do not use it for goodwill gestures or when the customer accepts credit; use issue_store_credit for that.",
    parameters: [
      stringParameter("orderId", ORDER_ID_DESCRIPTION),
      integerParameter("amountInCents", "Amount to refund in the order currency, in cents."),
      stringParameter("refundReason", "Why the money is returned.", {
        allowedValues: ["damagedItem", "lateDelivery", "wrongItem", "notReceived", "other"],
      }),
    ],
    fixedResult: { refundId: "RF-2240", refundStatus: "pending", expectedSettlementDays: 5 },
  },
  {
    toolName: "issue_store_credit",
    domainName: "refunds",
    toolDescription:
      "Adds store credit to a customer account that they can spend on future orders. No money goes back to a card. Do not use it when the customer asks for money back to their original payment method; use create_refund for that.",
    parameters: [
      stringParameter("customerId", "Customer identifier, for example CUS-5531."),
      integerParameter("amountInCents", "Credit amount in the account currency, in cents."),
      stringParameter("creditReason", "Short reason shown on the customer's credit history."),
    ],
    lookAlikeOf: "create_refund",
    fixedResult: { creditId: "CR-118", newCreditBalanceInCents: 1500 },
  },
  {
    toolName: "get_refund_status",
    domainName: "refunds",
    toolDescription:
      "Returns the status of one refund: pending, approved, sent, settled, failed or cancelled, with the date of the last change.",
    parameters: [stringParameter("refundId", REFUND_ID_DESCRIPTION)],
    fixedResult: { refundStatus: "pending", lastChangedOn: "2026-09-25" },
  },
  {
    toolName: "list_order_refunds",
    domainName: "refunds",
    toolDescription:
      "Lists every refund already created for one order, with amount, reason and status.",
    parameters: [stringParameter("orderId", ORDER_ID_DESCRIPTION)],
    fixedResult: {
      refunds: [{ refundId: "RF-2201", amountInCents: 1200, refundStatus: "settled" }],
    },
  },
  {
    toolName: "check_refund_eligibility",
    domainName: "refunds",
    toolDescription:
      "Checks whether one specific order can be refunded right now and returns the maximum refundable amount and any blocking reason.",
    parameters: [stringParameter("orderId", ORDER_ID_DESCRIPTION)],
    fixedResult: { isEligible: true, maximumRefundableInCents: 4190, blockingReason: null },
  },
  {
    toolName: "get_refund_policy",
    domainName: "refunds",
    toolDescription:
      "Returns the general refund policy text for a product category (time limits, conditions, exclusions). Do not use it to decide whether a specific order can be refunded; use check_refund_eligibility for that.",
    parameters: [
      stringParameter("productCategory", "Product category, for example apparel or furniture."),
    ],
    lookAlikeOf: "check_refund_eligibility",
    fixedResult: { policyText: "Refunds within 30 days of delivery for unused items." },
  },
  {
    toolName: "cancel_refund",
    domainName: "refunds",
    toolDescription:
      "Cancels a refund that has not been sent to the payment processor yet. Sent refunds cannot be cancelled.",
    parameters: [
      stringParameter("refundId", REFUND_ID_DESCRIPTION),
      stringParameter("cancellationReason", "Why the refund is cancelled."),
    ],
    fixedResult: { cancelled: true },
  },
  {
    toolName: "approve_refund",
    domainName: "refunds",
    toolDescription:
      "Approves a pending refund that needs manager sign-off so that it can be sent.",
    parameters: [
      stringParameter("refundId", REFUND_ID_DESCRIPTION),
      stringParameter("approverNote", "Optional note stored with the approval.", {
        isRequired: false,
      }),
    ],
    fixedResult: { refundStatus: "approved" },
  },
  {
    toolName: "escalate_refund",
    domainName: "refunds",
    toolDescription:
      "Escalates a delayed or disputed refund to the finance team with a reason. Use it when a refund has been pending too long.",
    parameters: [
      stringParameter("refundId", REFUND_ID_DESCRIPTION),
      stringParameter("escalationReason", "What is wrong and what has been tried."),
    ],
    fixedResult: { escalationId: "ESC-77", assignedTeam: "finance" },
  },
  {
    toolName: "get_refund_summary_report",
    domainName: "refunds",
    toolDescription:
      "Returns totals of refunds in a date range: count, amount, and a breakdown by reason.",
    parameters: [
      stringParameter("startDate", "First day of the range, ISO date."),
      stringParameter("endDate", "Last day of the range, ISO date."),
    ],
    fixedResult: { refundCount: 42, totalInCents: 183400, topReason: "damagedItem" },
  },
]);
