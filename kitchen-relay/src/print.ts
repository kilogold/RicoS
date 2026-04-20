import { getItemById, getSelectionDisplayLines, type LineSelections } from "@ricos/shared";

export type CartLine = { id: string; quantity: number; selections: LineSelections };

export function formatTicket(params: {
  paymentIntentId: string;
  amountCents: number;
  currency: string;
  lines: CartLine[];
  printedAt: Date;
  logFilePath?: string;
}): string {
  const { paymentIntentId, amountCents, currency, lines, printedAt } = params;
  const divider = "--------------------------------";
  const rows: string[] = [
    "RICOS — KITCHEN TICKET",
    divider,
    `PI: ${paymentIntentId}`,
    `Time: ${printedAt.toISOString()}`,
    divider,
  ];

  for (const line of lines) {
    const item = getItemById(line.id);
    const label = item?.name ?? line.id;
    rows.push(`${line.quantity}x ${label}`);
    const selectionRows = getSelectionDisplayLines(line.id, line.selections);
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

export async function printTicket(
  text: string,
  options: { logFilePath?: string } = {},
): Promise<void> {
  console.log(text);
  if (options.logFilePath) {
    const fs = await import("node:fs/promises");
    await fs.appendFile(options.logFilePath, text + "\n", "utf8");
  }
}
