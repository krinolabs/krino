export type BenchTaskDifficulty = "easy" | "lookAlike" | "multiStep";

export type BenchTask = {
  taskIdentifier: string;
  difficulty: BenchTaskDifficulty;
  /** The user message the agent receives. Synthetic data only; no real customers. */
  taskText: string;
  /** Tools a correct run calls, in the order it would call them. */
  expectedToolNames: Array<string>;
};

// Every task carries a literal `taskIdentifier`. Identifiers are stable: never reuse or
// renumber one, and never derive one from a task's position in the list.

const EASY_TASKS: Array<BenchTask> = [
  {
    taskIdentifier: "task-001",
    difficulty: "easy",
    taskText: "Cancel order ORD-10422; the customer changed their mind.",
    expectedToolNames: ["cancel_order"],
  },
  {
    taskIdentifier: "task-002",
    difficulty: "easy",
    taskText: "Add a note to order ORD-10431 saying gift wrap was requested by phone.",
    expectedToolNames: ["add_order_note"],
  },
  {
    taskIdentifier: "task-003",
    difficulty: "easy",
    taskText: "Approve refund RF-2201; the manager signed off.",
    expectedToolNames: ["approve_refund"],
  },
  {
    taskIdentifier: "task-004",
    difficulty: "easy",
    taskText: "Show me the refunds already issued for order ORD-10477.",
    expectedToolNames: ["list_order_refunds"],
  },
  {
    taskIdentifier: "task-005",
    difficulty: "easy",
    taskText: "Get shipping rates for a 1200 g parcel from 94107 to 10001.",
    expectedToolNames: ["get_shipping_rates"],
  },
  {
    taskIdentifier: "task-006",
    difficulty: "easy",
    taskText: "Which carriers can we use for shipments inside Canada?",
    expectedToolNames: ["list_carriers"],
  },
  {
    taskIdentifier: "task-007",
    difficulty: "easy",
    taskText: "Deactivate coupon SPRING25; it leaked on a deals forum.",
    expectedToolNames: ["deactivate_coupon"],
  },
  {
    taskIdentifier: "task-008",
    difficulty: "easy",
    taskText: "Which coupons are active today?",
    expectedToolNames: ["list_active_coupons"],
  },
  {
    taskIdentifier: "task-009",
    difficulty: "easy",
    taskText: "Change the email of customer CUS-5531 to dana.r@example.com.",
    expectedToolNames: ["update_customer_email"],
  },
  {
    taskIdentifier: "task-010",
    difficulty: "easy",
    taskText: "Merge duplicate customer account CUS-7710 into CUS-7702.",
    expectedToolNames: ["merge_customer_accounts"],
  },
  {
    taskIdentifier: "task-011",
    difficulty: "easy",
    taskText: "Move 40 units of SKU TEE-BLK-M from warehouse WH-EAST to WH-WEST.",
    expectedToolNames: ["transfer_stock"],
  },
  {
    taskIdentifier: "task-012",
    difficulty: "easy",
    taskText: "Set the count of SKU LAMP-01 in WH-EAST down by 2; they were damaged.",
    expectedToolNames: ["adjust_stock_count"],
  },
  {
    taskIdentifier: "task-013",
    difficulty: "easy",
    taskText: "Retry failed payment PAY-8812; the customer topped up their account.",
    expectedToolNames: ["retry_failed_payment"],
  },
  {
    taskIdentifier: "task-014",
    difficulty: "easy",
    taskText: "Which saved cards does customer CUS-5531 have?",
    expectedToolNames: ["get_saved_payment_methods"],
  },
  {
    taskIdentifier: "task-015",
    difficulty: "easy",
    taskText: "Generate a return label for return RET-3304.",
    expectedToolNames: ["generate_return_label"],
  },
  {
    taskIdentifier: "task-016",
    difficulty: "easy",
    taskText: "Reject return RET-3310; the shoes were clearly worn outdoors.",
    expectedToolNames: ["reject_return"],
  },
  {
    taskIdentifier: "task-017",
    difficulty: "easy",
    taskText: "Close ticket TCK-9001; the customer confirmed the fix works.",
    expectedToolNames: ["close_ticket"],
  },
  {
    taskIdentifier: "task-018",
    difficulty: "easy",
    taskText: "Ticket TCK-9017 duplicates TCK-9012. Merge it into TCK-9012.",
    expectedToolNames: ["merge_tickets"],
  },
  {
    taskIdentifier: "task-019",
    difficulty: "easy",
    taskText: "Show the job run log for nightly-invoice-export on 2026-09-30.",
    expectedToolNames: ["get_job_run_log"],
  },
  {
    taskIdentifier: "task-020",
    difficulty: "easy",
    taskText:
      "Export checkout-service logs from 2026-09-30T10:00:00Z to 2026-09-30T11:00:00Z as CSV.",
    expectedToolNames: ["export_logs"],
  },
];

const LOOK_ALIKE_TASKS: Array<BenchTask> = [
  {
    taskIdentifier: "task-021",
    difficulty: "lookAlike",
    taskText: "A customer asks: has order ORD-10422 shipped yet?",
    expectedToolNames: ["get_order_status"],
  },
  {
    taskIdentifier: "task-022",
    difficulty: "lookAlike",
    taskText: "Order ORD-10450 seems stuck. Is it on hold or waiting for payment internally?",
    expectedToolNames: ["get_order_state"],
  },
  {
    taskIdentifier: "task-023",
    difficulty: "lookAlike",
    taskText:
      "The customer wants 25 USD back on their card for order ORD-10477; the item arrived damaged.",
    expectedToolNames: ["create_refund"],
  },
  {
    taskIdentifier: "task-024",
    difficulty: "lookAlike",
    taskText: "Give customer CUS-5531 15 USD to spend on a future order as a goodwill gesture.",
    expectedToolNames: ["issue_store_credit"],
  },
  {
    taskIdentifier: "task-025",
    difficulty: "lookAlike",
    taskText: "Show every carrier scan for tracking number 1Z999AA10123456784.",
    expectedToolNames: ["get_shipment_tracking"],
  },
  {
    taskIdentifier: "task-026",
    difficulty: "lookAlike",
    taskText:
      "A shopper in 60614 has not ordered yet and asks how many days standard shipping takes.",
    expectedToolNames: ["estimate_delivery_window"],
  },
  {
    taskIdentifier: "task-027",
    difficulty: "lookAlike",
    taskText: "Does coupon SAVE20 work on a 45 USD cart right now?",
    expectedToolNames: ["validate_coupon"],
  },
  {
    taskIdentifier: "task-028",
    difficulty: "lookAlike",
    taskText: "How many times has coupon SAVE20 been redeemed in total?",
    expectedToolNames: ["get_coupon_usage"],
  },
  {
    taskIdentifier: "task-029",
    difficulty: "lookAlike",
    taskText: "Find the customer whose email is lee.park@example.com.",
    expectedToolNames: ["find_customer_by_email"],
  },
  {
    taskIdentifier: "task-030",
    difficulty: "lookAlike",
    taskText: "Block account CUS-6120 for now while we investigate possible fraud.",
    expectedToolNames: ["suspend_customer_account"],
  },
  {
    taskIdentifier: "task-031",
    difficulty: "lookAlike",
    taskText: "Can a customer in 30301 buy SKU MUG-WHT today?",
    expectedToolNames: ["get_stock_availability"],
  },
  {
    taskIdentifier: "task-032",
    difficulty: "lookAlike",
    taskText: "Which SKUs are completely sold out everywhere in the apparel category?",
    expectedToolNames: ["list_out_of_stock_items"],
  },
  {
    taskIdentifier: "task-033",
    difficulty: "lookAlike",
    taskText: "Collect the 80 USD that is already authorized on payment PAY-8820.",
    expectedToolNames: ["capture_payment"],
  },
  {
    taskIdentifier: "task-034",
    difficulty: "lookAlike",
    taskText: "We have no proof of delivery for dispute DSP-410. Concede it.",
    expectedToolNames: ["accept_dispute"],
  },
  {
    taskIdentifier: "task-035",
    difficulty: "lookAlike",
    taskText:
      "The customer wants to swap the medium shirt (line LI-2) on order ORD-10490 for a large, SKU TEE-BLK-L.",
    expectedToolNames: ["create_exchange_request"],
  },
  {
    taskIdentifier: "task-036",
    difficulty: "lookAlike",
    taskText: "Is order ORD-10490 still inside its return window?",
    expectedToolNames: ["check_return_window"],
  },
  {
    taskIdentifier: "task-037",
    difficulty: "lookAlike",
    taskText: "Tell the customer on ticket TCK-9004 that their replacement has shipped.",
    expectedToolNames: ["send_customer_reply"],
  },
  {
    taskIdentifier: "task-038",
    difficulty: "lookAlike",
    taskText: "Ticket TCK-9020 reports lost customer data. Page leadership about it now.",
    expectedToolNames: ["escalate_ticket"],
  },
  {
    taskIdentifier: "task-039",
    difficulty: "lookAlike",
    taskText:
      "Who changed the price of product PRD-77 between 2026-10-01T00:00:00Z and 2026-10-02T00:00:00Z?",
    expectedToolNames: ["search_audit_logs"],
  },
  {
    taskIdentifier: "task-040",
    difficulty: "lookAlike",
    taskText: "Show me the last 50 log lines from checkout-service.",
    expectedToolNames: ["tail_service_logs"],
  },
];

const MULTI_STEP_TASKS: Array<BenchTask> = [
  {
    taskIdentifier: "task-041",
    difficulty: "multiStep",
    taskText: "Find the customer with email ana.lopez@example.com and list their orders.",
    expectedToolNames: ["find_customer_by_email", "list_customer_orders"],
  },
  {
    taskIdentifier: "task-042",
    difficulty: "multiStep",
    taskText:
      "Check whether order ORD-10501 can be refunded; if it can, refund 30 USD to the card for late delivery.",
    expectedToolNames: ["check_refund_eligibility", "create_refund"],
  },
  {
    taskIdentifier: "task-043",
    difficulty: "multiStep",
    taskText:
      "Package 1Z999AA10123456790 for customer CUS-5600 is lost. Open a carrier claim, then open a high priority support ticket for the customer.",
    expectedToolNames: ["report_lost_package", "create_support_ticket"],
  },
  {
    taskIdentifier: "task-044",
    difficulty: "multiStep",
    taskText: "Check that coupon FALL15 works on a 60 USD cart, then apply it to order ORD-10520.",
    expectedToolNames: ["validate_coupon", "apply_coupon_to_order"],
  },
  {
    taskIdentifier: "task-045",
    difficulty: "multiStep",
    taskText:
      "Check the on-hand units of SKU LAMP-01 in WH-EAST, then reserve 2 units for order ORD-10530.",
    expectedToolNames: ["get_stock_level", "reserve_stock"],
  },
  {
    taskIdentifier: "task-046",
    difficulty: "multiStep",
    taskText: "Find out why payment PAY-8830 failed, then retry it.",
    expectedToolNames: ["get_payment_status", "retry_failed_payment"],
  },
  {
    taskIdentifier: "task-047",
    difficulty: "multiStep",
    taskText: "Record the inspection of return RET-3320 as grade A, then approve the return.",
    expectedToolNames: ["inspect_returned_item", "approve_return"],
  },
  {
    taskIdentifier: "task-048",
    difficulty: "multiStep",
    taskText:
      "Ticket TCK-9030 says checkout errors spiked. Get the checkout-service error rate for the last 30 minutes and add the result as an internal comment.",
    expectedToolNames: ["get_error_rate", "add_ticket_comment"],
  },
  {
    taskIdentifier: "task-049",
    difficulty: "multiStep",
    taskText:
      "Order ORD-10540 shows paid but the customer has no parcel. List its payments and check its shipment status.",
    expectedToolNames: ["list_order_payments", "get_shipment_status"],
  },
  {
    taskIdentifier: "task-050",
    difficulty: "multiStep",
    taskText:
      "Buy an express shipping label for order ORD-10550 and schedule a pickup for it on 2026-10-03.",
    expectedToolNames: ["create_shipping_label", "schedule_pickup"],
  },
  {
    taskIdentifier: "task-051",
    difficulty: "multiStep",
    taskText:
      "SKU DESK-OAK is low. Check when it is back in stock; if nothing is on order, order 50 units from supplier SUP-12.",
    expectedToolNames: ["get_restock_date", "create_purchase_order"],
  },
  {
    taskIdentifier: "task-052",
    difficulty: "multiStep",
    taskText:
      "Webhook endpoint WH-EP-3 of customer CUS-5800 is not receiving order.created events. Check the delivery log, then open a high priority ticket for the customer.",
    expectedToolNames: ["get_webhook_delivery_log", "create_support_ticket"],
  },
  {
    taskIdentifier: "task-053",
    difficulty: "multiStep",
    taskText: "Find the customer with email sam.k@example.com and show their loyalty points.",
    expectedToolNames: ["find_customer_by_email", "get_customer_loyalty_points"],
  },
  {
    taskIdentifier: "task-054",
    difficulty: "multiStep",
    taskText:
      "The confirmation email for order ORD-10560 never arrived. Check emails sent to jo.w@example.com since 2026-09-29, then get the order details.",
    expectedToolNames: ["get_email_delivery_log", "get_order_details"],
  },
  {
    taskIdentifier: "task-055",
    difficulty: "multiStep",
    taskText:
      "Cancel order ORD-10570 at the customer's request and release its stock reservation RSV-221.",
    expectedToolNames: ["cancel_order", "release_stock_reservation"],
  },
  {
    taskIdentifier: "task-056",
    difficulty: "multiStep",
    taskText:
      "Contest dispute DSP-415: read the dispute, get the carrier scans for tracking number 1Z999AA10123456791, then submit the delivery proof as evidence.",
    expectedToolNames: ["get_dispute_details", "get_shipment_tracking", "submit_dispute_evidence"],
  },
  {
    taskIdentifier: "task-057",
    difficulty: "multiStep",
    taskText:
      "Start a return for line LI-1 of order ORD-10580 because it is the wrong size, then send the customer a return label.",
    expectedToolNames: ["create_return_request", "generate_return_label"],
  },
  {
    taskIdentifier: "task-058",
    difficulty: "multiStep",
    taskText: "Refund RF-2230 has been pending for a week. Check its status, then escalate it.",
    expectedToolNames: ["get_refund_status", "escalate_refund"],
  },
  {
    taskIdentifier: "task-059",
    difficulty: "multiStep",
    taskText:
      "Request REQ-7f3a failed at checkout. Get its trace, then search payment-service logs for it between 2026-10-01T10:00:00Z and 2026-10-01T10:15:00Z.",
    expectedToolNames: ["get_request_trace", "search_application_logs"],
  },
  {
    taskIdentifier: "task-060",
    difficulty: "multiStep",
    taskText:
      "Change the shipping address of order ORD-10590 to 12 Elm St, Austin 78701, US, and add an order note that the customer asked by chat.",
    expectedToolNames: ["update_order_address", "add_order_note"],
  },
];

const TASK_IDENTIFIER_PATTERN = /^task-\d{3}$/;

/**
 * Checks the task list and returns a copy in the same order. Identifiers come from the task data,
 * never from a task's position, so reordering the list changes no task's identifier.
 * Throws on a malformed or repeated identifier.
 */
export function defineBenchTasks(benchTasks: ReadonlyArray<BenchTask>): Array<BenchTask> {
  const seenIdentifiers = new Set<string>();
  for (const benchTask of benchTasks) {
    const { taskIdentifier } = benchTask;
    if (!TASK_IDENTIFIER_PATTERN.test(taskIdentifier)) {
      throw new Error(`Bench task identifier "${taskIdentifier}" must look like task-NNN`);
    }
    if (seenIdentifiers.has(taskIdentifier)) {
      throw new Error(`Repeated bench task identifier: ${taskIdentifier}`);
    }
    seenIdentifiers.add(taskIdentifier);
  }
  return [...benchTasks];
}

/** 60 tasks: 20 easy, 20 look-alike, 20 multi-step, in a fixed order. */
export const BENCH_TASKS: ReadonlyArray<BenchTask> = defineBenchTasks([
  ...EASY_TASKS,
  ...LOOK_ALIKE_TASKS,
  ...MULTI_STEP_TASKS,
]);
