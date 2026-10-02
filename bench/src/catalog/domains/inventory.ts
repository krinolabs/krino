import {
  integerParameter,
  type MockToolDefinition,
  stringParameter,
  withDomainNote,
} from "../mock-tool-definition.js";

const SKU_DESCRIPTION = "Stock keeping unit, for example TEE-BLK-M.";
const WAREHOUSE_ID_DESCRIPTION = "Warehouse identifier, for example WH-EAST.";

const DOMAIN_NOTE =
  "Parameters: SKUs are upper case with dashes; quantities are whole units; warehouses are WH-EAST, WH-WEST and WH-SOUTH. Limits: counts refresh every 30 seconds; reservations expire after 24 hours unless paid. Example: TEE-BLK-M is a black tee, size M.";

export const INVENTORY_TOOLS: Array<MockToolDefinition> = withDomainNote(DOMAIN_NOTE, [
  {
    toolName: "get_stock_level",
    domainName: "inventory",
    toolDescription:
      "Returns the physical units on hand for a SKU, per warehouse or in one warehouse, including units already reserved for orders.",
    parameters: [
      stringParameter("sku", SKU_DESCRIPTION),
      stringParameter("warehouseId", "Only this warehouse. Omit for all warehouses.", {
        isRequired: false,
      }),
    ],
    fixedResult: { unitsOnHand: 64, unitsReserved: 9 },
  },
  {
    toolName: "get_stock_availability",
    domainName: "inventory",
    toolDescription:
      "Returns whether a customer at a postal code can buy a SKU today, after reservations and shipping rules. Do not use it for physical counts in a warehouse; use get_stock_level for that.",
    parameters: [
      stringParameter("sku", SKU_DESCRIPTION),
      stringParameter("postalCode", "Customer postal code."),
    ],
    lookAlikeOf: "get_stock_level",
    fixedResult: { isAvailable: true, sellableUnits: 55, shipsFromWarehouseId: "WH-SOUTH" },
  },
  {
    toolName: "reserve_stock",
    domainName: "inventory",
    toolDescription:
      "Reserves units of a SKU for an order so that they cannot be sold to someone else.",
    parameters: [
      stringParameter("sku", SKU_DESCRIPTION),
      integerParameter("quantity", "Units to reserve."),
      stringParameter("orderId", "Order identifier, for example ORD-10422."),
    ],
    fixedResult: { reservationId: "RSV-230", reservedUntil: "2026-10-03T12:00:00Z" },
  },
  {
    toolName: "release_stock_reservation",
    domainName: "inventory",
    toolDescription: "Releases a stock reservation so that its units can be sold again.",
    parameters: [stringParameter("reservationId", "Reservation identifier, for example RSV-221.")],
    fixedResult: { released: true },
  },
  {
    toolName: "adjust_stock_count",
    domainName: "inventory",
    toolDescription:
      "Corrects the on-hand count of a SKU in a warehouse after a cycle count, damage or loss.",
    parameters: [
      stringParameter("sku", SKU_DESCRIPTION),
      stringParameter("warehouseId", WAREHOUSE_ID_DESCRIPTION),
      integerParameter("quantityDelta", "Units to add (positive) or remove (negative)."),
      stringParameter("adjustmentReason", "Why the count changes.", {
        allowedValues: ["cycleCount", "damaged", "lost", "found"],
      }),
    ],
    fixedResult: { newUnitsOnHand: 60 },
  },
  {
    toolName: "transfer_stock",
    domainName: "inventory",
    toolDescription: "Moves units of a SKU from one warehouse to another.",
    parameters: [
      stringParameter("sku", SKU_DESCRIPTION),
      stringParameter("fromWarehouseId", "Warehouse the units leave."),
      stringParameter("toWarehouseId", "Warehouse the units go to."),
      integerParameter("quantity", "Units to move."),
    ],
    fixedResult: { transferId: "TRF-88", expectedArrivalOn: "2026-10-06" },
  },
  {
    toolName: "get_restock_date",
    domainName: "inventory",
    toolDescription:
      "Returns the expected date that a SKU is back in stock, from open purchase orders. Returns null when nothing is on order.",
    parameters: [stringParameter("sku", SKU_DESCRIPTION)],
    fixedResult: { expectedRestockOn: null, openPurchaseOrderCount: 0 },
  },
  {
    toolName: "create_purchase_order",
    domainName: "inventory",
    toolDescription: "Orders more units of a SKU from a supplier.",
    parameters: [
      stringParameter("sku", SKU_DESCRIPTION),
      integerParameter("quantity", "Units to order."),
      stringParameter("supplierId", "Supplier identifier, for example SUP-12."),
    ],
    fixedResult: { purchaseOrderId: "PO-1203", expectedDeliveryOn: "2026-10-20" },
  },
  {
    toolName: "list_low_stock_items",
    domainName: "inventory",
    toolDescription: "Lists SKUs in a warehouse whose on-hand units are below a threshold.",
    parameters: [
      stringParameter("warehouseId", WAREHOUSE_ID_DESCRIPTION),
      integerParameter("unitThreshold", "Return SKUs with fewer units than this."),
    ],
    fixedResult: {
      lowStockItems: [
        { sku: "DESK-OAK", unitsOnHand: 3 },
        { sku: "LAMP-01", unitsOnHand: 11 },
      ],
    },
  },
  {
    toolName: "list_out_of_stock_items",
    domainName: "inventory",
    toolDescription:
      "Lists SKUs that have zero sellable units in every warehouse, with how long they have been out. Do not use it to find items running low in one warehouse; use list_low_stock_items for that.",
    parameters: [
      stringParameter("productCategory", "Only this category, for example apparel.", {
        isRequired: false,
      }),
    ],
    lookAlikeOf: "list_low_stock_items",
    fixedResult: { outOfStockItems: [{ sku: "MUG-RED", outOfStockSince: "2026-09-20" }] },
  },
]);
