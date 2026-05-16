import type { KitchenOrderIntent } from "@ricos/shared";

export type OrderPaidPayload = {
  paymentIngressEventId: string;
  paymentReferenceId: string;
  customerName: string;
  serviceMode: "takeout" | "dine_in";
  amountCents: number;
  currency: string;
  intent: KitchenOrderIntent;
  lines: {
    id: string;
    quantity: number;
    selections: Record<string, string[]>;
    unitBasePriceCents: number;
    selectedModifiers: { groupId: string; optionId: string; optionSurchargeCents: number }[];
    lineUnitTotalCents: number;
    lineExtendedTotalCents: number;
    itemLabel?: string;
    selectionLines?: string[];
  }[];
};
