import {
  integerParameter,
  type MockToolDefinition,
  stringParameter,
  withDomainNote,
} from "../mock-tool-definition.js";

const ORDER_ID_DESCRIPTION = "Order identifier, for example ORD-10422.";

const DOMAIN_NOTE =
  "Parameters: orderId is ORD- plus digits and is case-sensitive; amounts are integer cents; dates are ISO 8601 in UTC. Limits: 60 calls per minute; lists return at most 100 orders. Example: totalInCents 4190 means 41.90 USD.";

export const ORDER_TOOLS: Array<MockToolDefinition> = withDomainNote(DOMAIN_NOTE, [
  {
    toolName: "get_order_status",
    domainName: "orders",
    toolDescription:
      "Returns the customer-facing fulfillment status of one order: placed, packed, shipped, delivered or cancelled, with the date of the last change. Use it to answer 'where is my order' or 'has it shipped'. Do not use it for the internal workflow or payment state of the order; use get_order_state for that.",
    parameters: [stringParameter("orderId", ORDER_ID_DESCRIPTION)],
    fixedResult: { fulfillmentStatus: "shipped", lastChangedOn: "2026-09-28" },
  },
  {
    toolName: "get_order_state",
    domainName: "orders",
    toolDescription:
      "Returns the internal workflow state of an order in the order-management system: draft, awaitingPayment, paymentFailed, onHold, readyToFulfill or closed, plus any hold reason. Use it when an order looks stuck or blocked. Do not use it to answer shipping or delivery questions from customers; use get_order_status for those.",
    parameters: [stringParameter("orderId", ORDER_ID_DESCRIPTION)],
    lookAlikeOf: "get_order_status",
    fixedResult: { workflowState: "onHold", holdReason: "addressVerification" },
  },
  {
    toolName: "get_order_details",
    domainName: "orders",
    toolDescription:
      "Returns the full record of one order: line items with SKU, quantity and price, subtotal, tax, shipping cost, discounts, billing and shipping addresses, and the customer identifier. Use it when you need line items or amounts.",
    parameters: [stringParameter("orderId", ORDER_ID_DESCRIPTION)],
    fixedResult: {
      customerId: "CUS-5531",
      lineItems: [{ lineItemId: "LI-1", sku: "TEE-BLK-M", quantity: 2, unitPriceInCents: 1800 }],
      totalInCents: 4190,
      currencyCode: "USD",
    },
  },
  {
    toolName: "get_order_summary",
    domainName: "orders",
    toolDescription:
      "Returns a one-sentence, human-readable summary of an order for notifications and chat previews (item count, total, status). Do not use it when you need line items, SKUs, amounts per item or addresses; use get_order_details for those.",
    parameters: [stringParameter("orderId", ORDER_ID_DESCRIPTION)],
    lookAlikeOf: "get_order_details",
    fixedResult: { summaryText: "2 items, 41.90 USD, shipped on 28 September." },
  },
  {
    toolName: "list_customer_orders",
    domainName: "orders",
    toolDescription:
      "Lists the orders of one known customer, newest first, with order identifier, date, total and fulfillment status. Use it when you already have the customer identifier.",
    parameters: [
      stringParameter("customerId", "Customer identifier, for example CUS-5531."),
      stringParameter("fulfillmentStatus", "Only return orders with this status.", {
        isRequired: false,
        allowedValues: ["placed", "packed", "shipped", "delivered", "cancelled"],
      }),
      integerParameter("limit", "Maximum number of orders to return. Defaults to 20.", {
        isRequired: false,
      }),
    ],
    fixedResult: {
      orders: [
        { orderId: "ORD-10422", placedOn: "2026-09-25", totalInCents: 4190 },
        { orderId: "ORD-10377", placedOn: "2026-08-14", totalInCents: 2599 },
      ],
    },
  },
  {
    toolName: "search_orders",
    domainName: "orders",
    toolDescription:
      "Full-text search across all orders by product name, partial order number, or recipient name, optionally within a date range. Do not use it when you already have a customer identifier; use list_customer_orders, which is exact and faster.",
    parameters: [
      stringParameter("query", "Free text to match, for example 'oak desk' or '1042'."),
      stringParameter("placedAfter", "Only orders placed on or after this ISO date.", {
        isRequired: false,
      }),
      stringParameter("placedBefore", "Only orders placed on or before this ISO date.", {
        isRequired: false,
      }),
    ],
    lookAlikeOf: "list_customer_orders",
    fixedResult: { matches: [{ orderId: "ORD-10422", matchedField: "productName" }] },
  },
  {
    toolName: "cancel_order",
    domainName: "orders",
    toolDescription:
      "Cancels an order that has not shipped yet and releases its stock. Fails if the order is already shipped. Payment voids or refunds are separate steps.",
    parameters: [
      stringParameter("orderId", ORDER_ID_DESCRIPTION),
      stringParameter("cancellationReason", "Why the order is cancelled.", {
        allowedValues: ["customerRequest", "fraudSuspected", "outOfStock", "duplicateOrder"],
      }),
    ],
    fixedResult: { cancelled: true, cancelledOn: "2026-10-02" },
  },
  {
    toolName: "update_order_address",
    domainName: "orders",
    toolDescription:
      "Changes the shipping address of an order before it ships. Fails once a shipping label exists.",
    parameters: [
      stringParameter("orderId", ORDER_ID_DESCRIPTION),
      stringParameter("addressLine", "Street and number, for example '12 Elm St'."),
      stringParameter("city", "City name."),
      stringParameter("postalCode", "Postal or ZIP code."),
      stringParameter("countryCode", "Two-letter ISO country code, for example US."),
    ],
    fixedResult: { updated: true, addressVerified: true },
  },
  {
    toolName: "add_order_note",
    domainName: "orders",
    toolDescription:
      "Adds an internal note to an order that warehouse and support staff can see. Customers never see order notes.",
    parameters: [
      stringParameter("orderId", ORDER_ID_DESCRIPTION),
      stringParameter("noteText", "The note to add, in plain text."),
    ],
    fixedResult: { noteId: "NOTE-881", visibleToCustomer: false },
  },
  {
    toolName: "get_order_history",
    domainName: "orders",
    toolDescription:
      "Returns the timeline of events for one order: creation, payment, edits, holds, notes, shipment and cancellation, each with time and actor.",
    parameters: [stringParameter("orderId", ORDER_ID_DESCRIPTION)],
    fixedResult: {
      events: [
        { eventType: "created", occurredAt: "2026-09-25T09:12:00Z", actor: "customer" },
        { eventType: "paid", occurredAt: "2026-09-25T09:12:30Z", actor: "system" },
      ],
    },
  },
]);
