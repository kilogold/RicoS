import type { CartLine } from "./types";

type OrderServiceMode = "takeout" | "dine_in";

function serviceModeLabel(serviceMode: OrderServiceMode | undefined): string {
  if (serviceMode === "dine_in") return "DINE-IN";
  if (serviceMode === "takeout") return "TAKEOUT";
  return "UNKNOWN";
}

export function formatTicket(params: {
  paymentReferenceId: string;
  serviceMode?: OrderServiceMode;
  amountCents: number;
  currency: string;
  lines: CartLine[];
  printedAt: Date;
}): string {
  const { paymentReferenceId, serviceMode, amountCents, currency, lines, printedAt } = params;
  const divider = "--------------------------------";
  const rows: string[] = [
    "RICOS — KITCHEN TICKET",
    divider,
    `Ref: ${paymentReferenceId}`,
    `Service: ${serviceModeLabel(serviceMode)}`,
    `Time: ${printedAt.toISOString()}`,
    divider,
  ];

  for (const line of lines) {
    const label = line.itemLabel ?? line.id;
    rows.push(`${line.quantity}x ${label}`);
    const selectionRows = line.selectionLines ?? [];
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
