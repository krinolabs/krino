import {
  integerParameter,
  type MockToolDefinition,
  stringParameter,
  withDomainNote,
} from "../mock-tool-definition.js";

const PAYMENT_ID_DESCRIPTION = "Payment identifier, for example PAY-8812.";
const DISPUTE_ID_DESCRIPTION = "Dispute identifier, for example DSP-410.";

const DOMAIN_NOTE =
  "Parameters: paymentId is PAY- plus digits; amounts are integer cents; payment methods are tokens, never card numbers. Limits: each write is idempotent per payment for 24 hours. Example: capturing amountInCents 8000 collects 80.00 USD.";

export const PAYMENT_TOOLS: Array<MockToolDefinition> = withDomainNote(DOMAIN_NOTE, [
  {
    toolName: "get_payment_status",
    domainName: "payments",
    toolDescription:
      "Returns the status of one payment (authorized, captured, failed, voided, refunded) and the processor's decline code if it failed.",
    parameters: [stringParameter("paymentId", PAYMENT_ID_DESCRIPTION)],
    fixedResult: { paymentStatus: "failed", declineCode: "insufficientFunds" },
  },
  {
    toolName: "authorize_payment",
    domainName: "payments",
    toolDescription:
      "Places a new hold on the customer's saved payment method for an order amount. No money moves until capture.",
    parameters: [
      stringParameter("orderId", "Order identifier, for example ORD-10422."),
      integerParameter("amountInCents", "Amount to hold, in cents."),
    ],
    fixedResult: { paymentId: "PAY-8850", paymentStatus: "authorized" },
  },
  {
    toolName: "capture_payment",
    domainName: "payments",
    toolDescription:
      "Collects money that was already authorized on an existing payment, fully or partly. Do not use it to place a new hold on a card; use authorize_payment for that.",
    parameters: [
      stringParameter("paymentId", PAYMENT_ID_DESCRIPTION),
      integerParameter("amountInCents", "Amount to capture, in cents. Omit to capture all.", {
        isRequired: false,
      }),
    ],
    lookAlikeOf: "authorize_payment",
    fixedResult: { paymentStatus: "captured", capturedInCents: 8000 },
  },
  {
    toolName: "list_order_payments",
    domainName: "payments",
    toolDescription: "Lists every payment attempt for an order with amount, method and status.",
    parameters: [stringParameter("orderId", "Order identifier, for example ORD-10422.")],
    fixedResult: {
      payments: [{ paymentId: "PAY-8812", amountInCents: 4190, paymentStatus: "captured" }],
    },
  },
  {
    toolName: "retry_failed_payment",
    domainName: "payments",
    toolDescription:
      "Retries a failed payment once with the same payment method. Use it after the customer fixes the cause.",
    parameters: [stringParameter("paymentId", PAYMENT_ID_DESCRIPTION)],
    fixedResult: { paymentStatus: "captured", retryCount: 1 },
  },
  {
    toolName: "update_payment_method",
    domainName: "payments",
    toolDescription:
      "Replaces a customer's default saved payment method with a new tokenized card or wallet.",
    parameters: [
      stringParameter("customerId", "Customer identifier, for example CUS-5531."),
      stringParameter("paymentMethodToken", "Token from the payment form. Never a card number."),
    ],
    fixedResult: { updated: true, cardLastFour: "4242" },
  },
  {
    toolName: "get_saved_payment_methods",
    domainName: "payments",
    toolDescription:
      "Lists a customer's saved payment methods with brand, last four digits and expiry.",
    parameters: [stringParameter("customerId", "Customer identifier, for example CUS-5531.")],
    fixedResult: {
      paymentMethods: [{ brand: "visa", cardLastFour: "4242", expiresOn: "2028-04" }],
    },
  },
  {
    toolName: "get_dispute_details",
    domainName: "payments",
    toolDescription:
      "Returns a card dispute (chargeback): reason, amount, related payment and order, and the evidence deadline.",
    parameters: [stringParameter("disputeId", DISPUTE_ID_DESCRIPTION)],
    fixedResult: {
      disputeReason: "productNotReceived",
      amountInCents: 4190,
      orderId: "ORD-10422",
      evidenceDueOn: "2026-10-09",
    },
  },
  {
    toolName: "submit_dispute_evidence",
    domainName: "payments",
    toolDescription:
      "Sends evidence to the card network to contest a dispute, such as delivery proof or customer messages.",
    parameters: [
      stringParameter("disputeId", DISPUTE_ID_DESCRIPTION),
      stringParameter("evidenceSummary", "What the evidence shows, in plain text."),
      stringParameter("trackingNumber", "Delivery tracking number, if relevant.", {
        isRequired: false,
      }),
    ],
    fixedResult: { submitted: true, disputeStatus: "underReview" },
  },
  {
    toolName: "accept_dispute",
    domainName: "payments",
    toolDescription:
      "Concedes a dispute: the customer keeps the money and no evidence is sent. Do not use it to contest a dispute; use submit_dispute_evidence for that.",
    parameters: [stringParameter("disputeId", DISPUTE_ID_DESCRIPTION)],
    lookAlikeOf: "submit_dispute_evidence",
    fixedResult: { disputeStatus: "lost" },
  },
]);
