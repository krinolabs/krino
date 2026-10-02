import {
  integerParameter,
  type MockToolDefinition,
  numberParameter,
  stringParameter,
} from "../mock-tool-definition.js";
import { withDomainNote } from "../tool-description.js";

const COUPON_CODE_DESCRIPTION = "Coupon code as the customer types it, for example SAVE20.";
const ORDER_ID_DESCRIPTION = "Order identifier, for example ORD-10422.";

const DOMAIN_NOTE =
  "Coupons API: codes are case-insensitive, stored in upper case. Max 50 calls per minute.";

export const COUPON_TOOLS: Array<MockToolDefinition> = withDomainNote(DOMAIN_NOTE, [
  {
    toolName: "validate_coupon",
    domainName: "coupons",
    coreDescription:
      "Checks whether a coupon code can be used on a cart of a given total right now and returns the discount it would give or the reason it is rejected.",
    parameters: [
      stringParameter("couponCode", COUPON_CODE_DESCRIPTION),
      integerParameter("cartTotalInCents", "Cart total before discounts, in cents."),
    ],
    fixedResult: { isValid: true, discountInCents: 900, rejectionReason: null },
  },
  {
    toolName: "get_coupon_details",
    domainName: "coupons",
    coreDescription:
      "Returns the configuration of a coupon: discount type and value, minimum spend, start and end dates. Do not use it to check whether a coupon works on a specific cart; use validate_coupon for that.",
    parameters: [stringParameter("couponCode", COUPON_CODE_DESCRIPTION)],
    lookAlikeOf: "validate_coupon",
    fixedResult: {
      discountType: "percent",
      discountValue: 20,
      minimumSpendInCents: 3000,
      expiresOn: "2026-12-31",
    },
  },
  {
    toolName: "apply_coupon_to_order",
    domainName: "coupons",
    coreDescription: "Applies a coupon to an existing unpaid order and recalculates its total.",
    parameters: [
      stringParameter("orderId", ORDER_ID_DESCRIPTION),
      stringParameter("couponCode", COUPON_CODE_DESCRIPTION),
    ],
    fixedResult: { applied: true, newTotalInCents: 3290 },
  },
  {
    toolName: "remove_coupon_from_order",
    domainName: "coupons",
    coreDescription: "Removes a coupon from an unpaid order and recalculates its total.",
    parameters: [
      stringParameter("orderId", ORDER_ID_DESCRIPTION),
      stringParameter("couponCode", COUPON_CODE_DESCRIPTION),
    ],
    fixedResult: { removed: true, newTotalInCents: 4190 },
  },
  {
    toolName: "create_coupon",
    domainName: "coupons",
    coreDescription:
      "Creates a coupon code that customers type at checkout, with a percent or fixed discount and an expiry date.",
    parameters: [
      stringParameter("couponCode", "The new code, letters and digits only."),
      stringParameter(
        "discountType",
        "Kind of discount: a percentage of the cart or a fixed amount.",
        {
          allowedValues: ["percent", "fixedAmount"],
        },
      ),
      numberParameter("discountValue", "Percent (0-100) or fixed amount in cents."),
      stringParameter("expiresOn", "Last day the code works, as an ISO date."),
    ],
    fixedResult: { created: true, couponId: "CPN-610" },
  },
  {
    toolName: "create_promotion",
    domainName: "coupons",
    coreDescription:
      "Creates an automatic promotion that applies to every eligible cart without any code. Do not use it when the customer must type a code at checkout; use create_coupon for that.",
    parameters: [
      stringParameter("promotionName", "Internal name of the promotion, shown in reports only."),
      numberParameter("discountPercent", "Percent off every eligible cart, from 0 to 100."),
      stringParameter("startsOn", "First day the promotion runs, as an ISO date."),
      stringParameter("endsOn", "Last day the promotion runs, as an ISO date."),
    ],
    lookAlikeOf: "create_coupon",
    fixedResult: { created: true, promotionId: "PRM-44" },
  },
  {
    toolName: "deactivate_coupon",
    domainName: "coupons",
    coreDescription:
      "Turns off a coupon immediately so that it can no longer be redeemed. Orders that already used it keep their discount.",
    parameters: [
      stringParameter("couponCode", COUPON_CODE_DESCRIPTION),
      stringParameter(
        "deactivationReason",
        "Why the coupon is turned off, kept in the coupon history.",
      ),
    ],
    fixedResult: { deactivated: true },
  },
  {
    toolName: "list_active_coupons",
    domainName: "coupons",
    coreDescription:
      "Lists coupons that are active today, optionally only those targeted at one customer.",
    parameters: [
      stringParameter("customerId", "Only coupons available to this customer.", {
        isRequired: false,
      }),
    ],
    fixedResult: { couponCodes: ["SAVE20", "WELCOME10", "FALL15"] },
  },
  {
    toolName: "get_coupon_usage",
    domainName: "coupons",
    coreDescription:
      "Returns aggregate usage of a coupon: total redemptions, remaining uses, and total discount given.",
    parameters: [stringParameter("couponCode", COUPON_CODE_DESCRIPTION)],
    fixedResult: { redemptionCount: 318, remainingUses: 182, totalDiscountInCents: 286200 },
  },
  {
    toolName: "get_coupon_redemptions",
    domainName: "coupons",
    coreDescription:
      "Lists individual redemptions of a coupon with order identifier, customer and date. Do not use it for totals or counts; use get_coupon_usage for those.",
    parameters: [
      stringParameter("couponCode", COUPON_CODE_DESCRIPTION),
      integerParameter("limit", "Maximum number of redemptions to return.", {
        isRequired: false,
      }),
    ],
    lookAlikeOf: "get_coupon_usage",
    fixedResult: {
      redemptions: [{ orderId: "ORD-10422", customerId: "CUS-5531", redeemedOn: "2026-09-25" }],
    },
  },
]);
