import { type MockToolDefinition, stringParameter } from "../mock-tool-definition.js";
import { withDomainNote } from "../tool-description.js";

const RETURN_ID_DESCRIPTION = "Return identifier, for example RET-3304.";
const ORDER_ID_DESCRIPTION = "Order identifier, for example ORD-10490.";
const LINE_ITEM_ID_DESCRIPTION = "Line item identifier within the order, for example LI-2.";

const DOMAIN_NOTE =
  "Returns API: each return or exchange covers one order line. Max 35 calls per minute.";

export const RETURN_TOOLS: Array<MockToolDefinition> = withDomainNote(DOMAIN_NOTE, [
  {
    toolName: "create_return_request",
    domainName: "returns",
    coreDescription:
      "Opens a return for one line item of an order so that the customer can send it back for a refund.",
    parameters: [
      stringParameter("orderId", ORDER_ID_DESCRIPTION),
      stringParameter("lineItemId", LINE_ITEM_ID_DESCRIPTION),
      stringParameter("returnReason", "Why the item comes back, printed on the return label.", {
        allowedValues: ["wrongSize", "damaged", "notAsDescribed", "changedMind"],
      }),
    ],
    fixedResult: { returnId: "RET-3330", returnStatus: "requested" },
  },
  {
    toolName: "create_exchange_request",
    domainName: "returns",
    coreDescription:
      "Opens an exchange: the customer sends one line item back and receives a different SKU instead of money. Do not use it when the customer wants a refund; use create_return_request for that.",
    parameters: [
      stringParameter("orderId", ORDER_ID_DESCRIPTION),
      stringParameter("lineItemId", LINE_ITEM_ID_DESCRIPTION),
      stringParameter("replacementSku", "SKU the customer wants instead, for example TEE-BLK-L."),
    ],
    lookAlikeOf: "create_return_request",
    fixedResult: { exchangeId: "EXC-212", replacementReserved: true },
  },
  {
    toolName: "get_return_status",
    domainName: "returns",
    coreDescription:
      "Returns the status of a return: requested, label sent, in transit, received, inspected, approved or rejected.",
    parameters: [stringParameter("returnId", RETURN_ID_DESCRIPTION)],
    fixedResult: { returnStatus: "inTransit" },
  },
  {
    toolName: "generate_return_label",
    domainName: "returns",
    coreDescription:
      "Creates a prepaid return shipping label for a return and emails it to the customer.",
    parameters: [stringParameter("returnId", RETURN_ID_DESCRIPTION)],
    fixedResult: { labelId: "RLBL-77", emailedToCustomer: true },
  },
  {
    toolName: "inspect_returned_item",
    domainName: "returns",
    coreDescription:
      "Records the warehouse inspection of a returned item with a condition grade and a note.",
    parameters: [
      stringParameter("returnId", RETURN_ID_DESCRIPTION),
      stringParameter("conditionGrade", "Condition of the item: A is like new, D is unsellable.", {
        allowedValues: ["A", "B", "C", "D"],
      }),
      stringParameter("inspectorNote", "What the inspector saw, in plain text.", {
        isRequired: false,
      }),
    ],
    fixedResult: { inspected: true },
  },
  {
    toolName: "approve_return",
    domainName: "returns",
    coreDescription:
      "Approves an inspected return. A refund is created automatically for the item price.",
    parameters: [stringParameter("returnId", RETURN_ID_DESCRIPTION)],
    fixedResult: { returnStatus: "approved", refundId: "RF-2251" },
  },
  {
    toolName: "reject_return",
    domainName: "returns",
    coreDescription:
      "Rejects a return and ships the item back to the customer. A reason is required.",
    parameters: [
      stringParameter("returnId", RETURN_ID_DESCRIPTION),
      stringParameter("rejectionReason", "Why the return is rejected, shown to the customer."),
    ],
    fixedResult: { returnStatus: "rejected" },
  },
  {
    toolName: "check_return_window",
    domainName: "returns",
    coreDescription:
      "Checks whether a specific order is still inside its return window and returns the last day to start a return.",
    parameters: [stringParameter("orderId", ORDER_ID_DESCRIPTION)],
    fixedResult: { isInsideWindow: true, lastReturnDay: "2026-10-28" },
  },
  {
    toolName: "get_return_policy",
    domainName: "returns",
    coreDescription:
      "Returns the general return policy text for a product category. Do not use it to check whether a specific order can still be returned; use check_return_window for that.",
    parameters: [
      stringParameter("productCategory", "Product category, for example apparel or furniture."),
    ],
    lookAlikeOf: "check_return_window",
    fixedResult: { policyText: "Returns within 30 days of delivery; furniture within 14 days." },
  },
  {
    toolName: "list_customer_returns",
    domainName: "returns",
    coreDescription: "Lists every return and exchange of one customer with status and date.",
    parameters: [stringParameter("customerId", "Customer identifier, for example CUS-5531.")],
    fixedResult: { returns: [{ returnId: "RET-3304", returnStatus: "approved" }] },
  },
]);
