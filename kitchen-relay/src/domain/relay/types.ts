import type { KitchenOrderIntent, OrderTotals, PurchaseOrderLine } from "@ricos/shared";

export type OrderPaidPayload = OrderTotals & {
  paymentIngressEventId: string;
  paymentReferenceId: string;
  customerName: string;
  serviceMode: "takeout" | "dine_in";
  currency: string;
  intent: KitchenOrderIntent;
  lines: PurchaseOrderLine[];
};

export type PrintJobHandlerInput = {
  printJobId: string;
  payload: OrderPaidPayload;
};
