import type { PurchaseOrderLine } from "@ricos/shared";
import type { CartLine } from "./types";

/** Map persisted order lines into formatter-local `CartLine` rows. */
export function toCartLines(lines: PurchaseOrderLine[]): CartLine[] {
  return lines.map((line) => ({
    id: line.id,
    quantity: line.quantity,
    selections: line.selections,
    lineUnitTotalCents: line.lineUnitTotalCents,
    lineExtendedTotalCents: line.lineExtendedTotalCents,
    itemLabel: line.itemLabel,
    selectionLines: line.selectionLines,
  }));
}
