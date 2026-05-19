import type { PrintStation } from "./menu-types";

/** One persisted / ticket line on a purchase order (web + kitchen-relay). */
export type PurchaseOrderLine = {
  id: string;
  quantity: number;
  selections: Record<string, string[]>;
  unitBasePriceCents: number;
  selectedModifiers: { groupId: string; optionId: string; optionSurchargeCents: number }[];
  lineUnitTotalCents: number;
  lineExtendedTotalCents: number;
  station: PrintStation;
  /** English primary label for tickets (server-filled on ingress). */
  itemLabel: string;
  /** English modifier summary lines for tickets (empty array when none). */
  selectionLines: string[];
};
