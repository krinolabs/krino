import {
  booleanParameter,
  type MockToolDefinition,
  stringParameter,
} from "../mock-tool-definition.js";
import { withDomainNote } from "../tool-description.js";

const CUSTOMER_ID_DESCRIPTION = "Customer identifier, for example CUS-5531.";

const DOMAIN_NOTE =
  "Customers API: customer data is personal and writes are audited. Max 30 calls per minute.";

export const CUSTOMER_TOOLS: Array<MockToolDefinition> = withDomainNote(DOMAIN_NOTE, [
  {
    toolName: "get_customer_profile",
    domainName: "customers",
    coreDescription:
      "Returns the profile of one customer: name, email, phone, default address, account creation date and account status.",
    parameters: [stringParameter("customerId", CUSTOMER_ID_DESCRIPTION)],
    fixedResult: {
      fullName: "Dana Reyes",
      emailAddress: "dana.r@example.com",
      accountStatus: "active",
      createdOn: "2024-03-02",
    },
  },
  {
    toolName: "find_customer_by_email",
    domainName: "customers",
    coreDescription:
      "Finds the one customer whose account email exactly matches the given address and returns the customer identifier.",
    parameters: [stringParameter("emailAddress", "Exact email address, case-insensitive.")],
    fixedResult: { customerId: "CUS-5531", matched: true },
  },
  {
    toolName: "search_customers",
    domainName: "customers",
    coreDescription:
      "Fuzzy search for customers by partial name, city, or partial phone number; may return several matches. Do not use it when you have an exact email address; use find_customer_by_email for that.",
    parameters: [stringParameter("query", "Free text, for example 'reyes austin'.")],
    lookAlikeOf: "find_customer_by_email",
    fixedResult: {
      matches: [
        { customerId: "CUS-5531", fullName: "Dana Reyes" },
        { customerId: "CUS-6012", fullName: "Dan Reyes" },
      ],
    },
  },
  {
    toolName: "update_customer_email",
    domainName: "customers",
    coreDescription:
      "Changes the login and contact email of a customer and sends a confirmation to the new address.",
    parameters: [
      stringParameter("customerId", CUSTOMER_ID_DESCRIPTION),
      stringParameter(
        "newEmailAddress",
        "The new email address; a confirmation link is sent to it.",
      ),
    ],
    fixedResult: { updated: true, confirmationSent: true },
  },
  {
    toolName: "update_contact_preferences",
    domainName: "customers",
    coreDescription:
      "Sets whether a customer receives marketing email and marketing text messages. Order updates are always sent.",
    parameters: [
      stringParameter("customerId", CUSTOMER_ID_DESCRIPTION),
      booleanParameter("marketingEmailOptIn", "True to receive marketing email."),
      booleanParameter("marketingSmsOptIn", "True to receive marketing text messages."),
    ],
    fixedResult: { updated: true },
  },
  {
    toolName: "get_customer_loyalty_points",
    domainName: "customers",
    coreDescription:
      "Returns the loyalty points balance of a customer and the points that expire in the next 30 days.",
    parameters: [stringParameter("customerId", CUSTOMER_ID_DESCRIPTION)],
    fixedResult: { pointsBalance: 2350, pointsExpiringSoon: 200 },
  },
  {
    toolName: "get_customer_loyalty_tier",
    domainName: "customers",
    coreDescription:
      "Returns the loyalty tier of a customer (bronze, silver, gold) and what is needed for the next tier. Do not use it for a points balance; use get_customer_loyalty_points for that.",
    parameters: [stringParameter("customerId", CUSTOMER_ID_DESCRIPTION)],
    lookAlikeOf: "get_customer_loyalty_points",
    fixedResult: { loyaltyTier: "silver", spendToNextTierInCents: 15000 },
  },
  {
    toolName: "merge_customer_accounts",
    domainName: "customers",
    coreDescription:
      "Merges a duplicate customer account into a primary one, moving orders, credit and points. The duplicate is closed.",
    parameters: [
      stringParameter(
        "primaryCustomerId",
        "Customer identifier of the account to keep, for example CUS-7702.",
      ),
      stringParameter(
        "duplicateCustomerId",
        "Customer identifier of the account to merge and close.",
      ),
    ],
    fixedResult: { merged: true, movedOrderCount: 3 },
  },
  {
    toolName: "close_customer_account",
    domainName: "customers",
    coreDescription:
      "Permanently closes a customer account and schedules personal data deletion. This cannot be undone.",
    parameters: [
      stringParameter("customerId", CUSTOMER_ID_DESCRIPTION),
      stringParameter("closureReason", "Why the account is closed, kept for compliance records."),
    ],
    fixedResult: { closed: true, dataDeletionOn: "2026-11-01" },
  },
  {
    toolName: "suspend_customer_account",
    domainName: "customers",
    coreDescription:
      "Temporarily blocks sign-in and checkout for a customer account; it can be lifted later. Do not use it to close an account for good; use close_customer_account for that.",
    parameters: [
      stringParameter("customerId", CUSTOMER_ID_DESCRIPTION),
      stringParameter(
        "suspensionReason",
        "Why the account is suspended, shown to staff who lift it.",
      ),
    ],
    lookAlikeOf: "close_customer_account",
    fixedResult: { suspended: true },
  },
]);
