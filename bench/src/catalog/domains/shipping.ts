import {
  integerParameter,
  type MockToolDefinition,
  stringParameter,
  withDomainNote,
} from "../mock-tool-definition.js";

const ORDER_ID_DESCRIPTION = "Order identifier, for example ORD-10422.";
const TRACKING_NUMBER_DESCRIPTION = "Carrier tracking number, for example 1Z999AA10123456784.";
const SERVICE_LEVEL_VALUES = ["economy", "standard", "express", "overnight"];

const DOMAIN_NOTE =
  "Shipping API: tracking numbers are carrier-specific and case-insensitive. Weights are in grams; postal codes are strings, never numbers. Carrier data can lag by up to two hours. Label purchases are billed to the merchant carrier account.";

export const SHIPPING_TOOLS: Array<MockToolDefinition> = withDomainNote(DOMAIN_NOTE, [
  {
    toolName: "get_shipment_tracking",
    domainName: "shipping",
    toolDescription:
      "Returns the carrier scan events for a tracking number: each scan with location, time and description. Use it when you have a tracking number and need the detailed journey.",
    parameters: [stringParameter("trackingNumber", TRACKING_NUMBER_DESCRIPTION)],
    fixedResult: {
      carrierName: "UPS",
      scanEvents: [
        { location: "Louisville, KY", occurredAt: "2026-09-29T04:10:00Z", scanText: "Departed" },
      ],
    },
  },
  {
    toolName: "get_shipment_status",
    domainName: "shipping",
    toolDescription:
      "Returns the latest shipment status for an order (labelCreated, inTransit, outForDelivery, delivered, exception) and its tracking number. Do not use it when you need each carrier scan; use get_shipment_tracking for that.",
    parameters: [stringParameter("orderId", ORDER_ID_DESCRIPTION)],
    lookAlikeOf: "get_shipment_tracking",
    fixedResult: { shipmentStatus: "inTransit", trackingNumber: "1Z999AA10123456784" },
  },
  {
    toolName: "get_shipping_rates",
    domainName: "shipping",
    toolDescription:
      "Quotes shipping prices for a parcel between two postal codes for every service level.",
    parameters: [
      stringParameter("originPostalCode", "Postal code the parcel ships from."),
      stringParameter("destinationPostalCode", "Postal code the parcel ships to."),
      integerParameter("weightInGrams", "Parcel weight in grams."),
    ],
    fixedResult: {
      rates: [
        { serviceLevel: "standard", priceInCents: 899 },
        { serviceLevel: "express", priceInCents: 1999 },
      ],
    },
  },
  {
    toolName: "estimate_delivery_date",
    domainName: "shipping",
    toolDescription:
      "Estimates the delivery date of an existing order that has already been placed, using its shipment and carrier data.",
    parameters: [stringParameter("orderId", ORDER_ID_DESCRIPTION)],
    fixedResult: { estimatedDeliveryOn: "2026-10-04", confidence: "high" },
  },
  {
    toolName: "estimate_delivery_window",
    domainName: "shipping",
    toolDescription:
      "Estimates how many days delivery would take to a postal code for a service level, for an order that does not exist yet. Do not use it for an order that was already placed; use estimate_delivery_date for that.",
    parameters: [
      stringParameter("destinationPostalCode", "Postal code the parcel would ship to."),
      stringParameter("serviceLevel", "Shipping speed.", { allowedValues: SERVICE_LEVEL_VALUES }),
    ],
    lookAlikeOf: "estimate_delivery_date",
    fixedResult: { minimumDays: 3, maximumDays: 5 },
  },
  {
    toolName: "create_shipping_label",
    domainName: "shipping",
    toolDescription:
      "Buys a shipping label for an order and returns the label identifier and tracking number.",
    parameters: [
      stringParameter("orderId", ORDER_ID_DESCRIPTION),
      stringParameter("serviceLevel", "Shipping speed.", { allowedValues: SERVICE_LEVEL_VALUES }),
    ],
    fixedResult: { labelId: "LBL-5521", trackingNumber: "1Z999AA10123456785" },
  },
  {
    toolName: "void_shipping_label",
    domainName: "shipping",
    toolDescription: "Voids an unused shipping label so that the carrier does not charge for it.",
    parameters: [
      stringParameter("labelId", "Label identifier, for example LBL-5521."),
      stringParameter("voidReason", "Why the label is voided."),
    ],
    fixedResult: { voided: true },
  },
  {
    toolName: "schedule_pickup",
    domainName: "shipping",
    toolDescription: "Schedules a carrier pickup for a shipping label on a given date.",
    parameters: [
      stringParameter("labelId", "Label identifier, for example LBL-5521."),
      stringParameter("pickupDate", "Pickup day, ISO date."),
    ],
    fixedResult: { pickupId: "PU-310", pickupWindow: "13:00-17:00" },
  },
  {
    toolName: "report_lost_package",
    domainName: "shipping",
    toolDescription: "Opens a lost-package claim with the carrier for a tracking number.",
    parameters: [
      stringParameter("trackingNumber", TRACKING_NUMBER_DESCRIPTION),
      stringParameter("lastSeenDate", "Date of the last carrier scan, ISO date.", {
        isRequired: false,
      }),
    ],
    fixedResult: { claimId: "CLM-904", claimStatus: "submitted" },
  },
  {
    toolName: "list_carriers",
    domainName: "shipping",
    toolDescription:
      "Lists the carriers and service levels available for shipments within one country.",
    parameters: [stringParameter("countryCode", "Two-letter ISO country code, for example CA.")],
    fixedResult: { carriers: ["Canada Post", "Purolator", "UPS"] },
  },
]);
