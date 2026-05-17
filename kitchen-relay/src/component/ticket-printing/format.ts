import type { OrderTotals } from "@ricos/shared";
import type { CartLine } from "./types";

type OrderServiceMode = "takeout" | "dine_in";

function serviceModeLabel(serviceMode: OrderServiceMode | undefined): string {
  if (serviceMode === "dine_in") return "DINE-IN";
  if (serviceMode === "takeout") return "TAKEOUT";
  return "UNKNOWN";
}

function formatMoneyAmount(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Label left, amount right-aligned within `lineWidth` (matches divider). */
function formatAlignedRow(left: string, cents: number, lineWidth: number): string {
  const right = formatMoneyAmount(cents);
  const gap = lineWidth - left.length - right.length;
  return gap >= 1 ? left + " ".repeat(gap) + right : left + right;
}

function formatTotalsLine(label: string, cents: number, lineWidth: number): string {
  return formatAlignedRow(`${label}: `, cents, lineWidth);
}

export function formatTicket(
  params: OrderTotals & {
    paymentReferenceId: string;
    customerName: string;
    serviceMode?: OrderServiceMode;
    currency: string;
    lines: CartLine[];
    printedAt: Date;
  },
): string {
  const {
    paymentReferenceId,
    customerName,
    serviceMode,
    subtotalCents,
    serviceChargeCents,
    salesTaxCents,
    municipalTaxCents,
    grandTotalCents,
    lines,
    printedAt,
  } = params;
  const divider = "--------------------------------";
  const rows: string[] = [
    "RICOS — KITCHEN TICKET",
    divider,
    `Ref: ${paymentReferenceId}`,
    `Time: ${printedAt.toISOString()}`,
    `Name: ${customerName.trim()}`,
    `Service: ${serviceModeLabel(serviceMode)}`,
    divider,
  ];
  const lineWidth = divider.length;

  for (const line of lines) {
    const label = line.itemLabel ?? line.id;
    rows.push(
      formatAlignedRow(`${line.quantity}x ${label}`, line.lineExtendedTotalCents, lineWidth),
    );
    if (line.quantity > 1) {
      rows.push(`   ${formatMoneyAmount(line.lineUnitTotalCents)} each`);
    }
    const selectionRows = line.selectionLines ?? [];
    for (const selection of selectionRows) {
      rows.push(`   ${selection}`);
    }
  }

  rows.push(divider);
  rows.push(formatTotalsLine("SUBTOTAL", subtotalCents, lineWidth));
  rows.push(formatTotalsLine("SERVICE CHARGE", serviceChargeCents, lineWidth));
  rows.push(formatTotalsLine("SALES TAX", salesTaxCents, lineWidth));
  rows.push(formatTotalsLine("MUNICIPAL TAX", municipalTaxCents, lineWidth));
  rows.push(formatTotalsLine("TOTAL", grandTotalCents, lineWidth));
  rows.push(divider);
  rows.push("");

  return rows.join("\n");
}
