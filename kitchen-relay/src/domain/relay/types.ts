import type { KitchenOrderIntent, OrderTotals } from "@ricos/shared";

export type OrderPaidLine = {
  id: string;
  quantity: number;
  selections: Record<string, string[]>;
  unitBasePriceCents: number;
  selectedModifiers: { groupId: string; optionId: string; optionSurchargeCents: number }[];
  lineUnitTotalCents: number;
  lineExtendedTotalCents: number;
  itemLabel?: string;
  selectionLines?: string[];
};

export type OrderPaidPayload = OrderTotals & {
  paymentIngressEventId: string;
  paymentReferenceId: string;
  customerName: string;
  serviceMode: "takeout" | "dine_in";
  currency: string;
  intent: KitchenOrderIntent;
  lines: OrderPaidLine[];
};

export type PrintJobHandlerInput = {
  printJobId: string;
  payload: OrderPaidPayload;
};
