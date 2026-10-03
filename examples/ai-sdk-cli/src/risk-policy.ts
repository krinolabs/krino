import { type RiskGatePolicy, thresholdFromCosts } from "@krinolabs/krino";

// The risk-gate policy, by what each tool does. Read-only tools are always allowed. Write tools
// need a confident "safe" answer: the threshold comes from what asking and a bad call cost.
// Destructive tools are blocked in code. The first word of a tool's name gives the default; the
// override table below fixes the tools whose effect the name does not show.

export type ToolClassification =
  | { toolRisk: "readOnly" }
  | { toolRisk: "write"; costOfBadCallInUsd: number }
  | { toolRisk: "destructive" };

/** One `askHuman`: a person's minute and a stalled run. */
const COST_OF_ASKING_IN_USD = 0.5;

/** A routine bad write, such as a wrong ticket: $0.50 / $5 → 0.9. */
const ROUTINE_WRITE: ToolClassification = { toolRisk: "write", costOfBadCallInUsd: 5 };
/** Money moves or data leaves the system: $0.50 / $50 → 0.99. */
const COSTLY_WRITE: ToolClassification = { toolRisk: "write", costOfBadCallInUsd: 50 };
const DESTRUCTIVE: ToolClassification = { toolRisk: "destructive" };

/** First words of tools that only read. */
const READ_ONLY_VERBS: ReadonlyArray<string> = [
  "get",
  "list",
  "search",
  "find",
  "check",
  "validate",
  "estimate",
  "tail",
];

/** First words of tools that destroy data. */
const DESTRUCTIVE_VERBS: ReadonlyArray<string> = ["delete", "purge"];

/** Tools classified by effect, where the first-word rule gets them wrong or underprices them. */
export const TOOL_CLASSIFICATION_OVERRIDES: ReadonlyMap<string, ToolClassification> = new Map<
  string,
  ToolClassification
>([
  // Writes logs to a downloadable file: data can leave the system.
  ["export_logs", COSTLY_WRITE],
  // Sends money back to the customer's card or wallet.
  ["create_refund", COSTLY_WRITE],
  // Adds credit the customer can spend.
  ["issue_store_credit", COSTLY_WRITE],
  // Stops a refund the customer is owed.
  ["cancel_refund", COSTLY_WRITE],
  // Releases a pending refund for payout.
  ["approve_refund", COSTLY_WRITE],
  // Hands a refund to finance for payout.
  ["escalate_refund", COSTLY_WRITE],
  // Places a hold on the customer's card.
  ["authorize_payment", COSTLY_WRITE],
  // Collects money from the customer.
  ["capture_payment", COSTLY_WRITE],
  // Charges the customer again.
  ["retry_failed_payment", COSTLY_WRITE],
  // Changes which card future charges go to.
  ["update_payment_method", COSTLY_WRITE],
  // Contests a chargeback; the outcome decides who keeps the money.
  ["submit_dispute_evidence", COSTLY_WRITE],
  // Gives up the disputed money.
  ["accept_dispute", COSTLY_WRITE],
  // A wrong void cancels a label a real shipment needs: $0.50 / $20 → 0.975.
  ["void_shipping_label", { toolRisk: "write", costOfBadCallInUsd: 20 }],
  // Irreversible: closes the account and schedules personal data deletion.
  ["close_customer_account", DESTRUCTIVE],
  // Irreversible: moves everything into the primary account and closes the duplicate.
  ["merge_customer_accounts", DESTRUCTIVE],
]);

export function classifyTool(toolName: string): ToolClassification {
  const overriddenClassification = TOOL_CLASSIFICATION_OVERRIDES.get(toolName);
  if (overriddenClassification !== undefined) {
    return overriddenClassification;
  }
  const firstWord = toolName.split("_")[0] ?? "";
  if (DESTRUCTIVE_VERBS.includes(firstWord)) {
    return DESTRUCTIVE;
  }
  return READ_ONLY_VERBS.includes(firstWord) ? { toolRisk: "readOnly" } : ROUTINE_WRITE;
}

export function buildRiskGatePolicy(toolNames: ReadonlyArray<string>): RiskGatePolicy {
  const riskGatePolicy: RiskGatePolicy = {
    blockedToolNames: [],
    alwaysAllowedToolNames: [],
    allowThresholdByToolName: {},
  };
  const thresholdEntries: Array<[string, number]> = [];
  for (const toolName of toolNames) {
    const toolClassification = classifyTool(toolName);
    if (toolClassification.toolRisk === "readOnly") {
      riskGatePolicy.alwaysAllowedToolNames.push(toolName);
    } else if (toolClassification.toolRisk === "destructive") {
      riskGatePolicy.blockedToolNames.push(toolName);
    } else {
      const allowThreshold = thresholdFromCosts({
        costOfAskingInUsd: COST_OF_ASKING_IN_USD,
        costOfBadCallInUsd: toolClassification.costOfBadCallInUsd,
      });
      thresholdEntries.push([toolName, allowThreshold]);
    }
  }
  // Object.fromEntries defines own properties, so a name like `__proto__` stays a plain key.
  riskGatePolicy.allowThresholdByToolName = Object.fromEntries(thresholdEntries);
  return riskGatePolicy;
}
