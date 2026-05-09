import {
  getItemById,
  getSelectionDisplayLines,
  resolveLocalizedText,
} from "@ricos/shared";
import type { CartLine } from "./types";

export function formatTicket(params: {
  paymentReferenceId: string;
  amountCents: number;
  currency: string;
  lines: CartLine[];
  printedAt: Date;
}): string {
  const { paymentReferenceId, amountCents, currency, lines, printedAt } = params;
  const divider = "--------------------------------";
  const rows: string[] = [
    "RICOS — KITCHEN TICKET",
    divider,
    `Ref: ${paymentReferenceId}`,
    `Time: ${printedAt.toISOString()}`,
    divider,
  ];

  for (const line of lines) {
    const item = getItemById(line.id);
    const label = item ? resolveLocalizedText(item.name, "en") : line.id;
    rows.push(`${line.quantity}x ${label}`);
    const selectionRows = getSelectionDisplayLines(line.id, line.selections, "en");
    for (const selection of selectionRows) {
      rows.push(`   ${selection}`);
    }
  }

  rows.push(divider);
  rows.push(`TOTAL: ${(amountCents / 100).toFixed(2)} ${currency.toUpperCase()}`);
  rows.push(divider);
  rows.push("");

  return rows.join("\n");
}
