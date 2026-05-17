import type { KitchenOrderIntent, OrderTotals } from "@ricos/shared";
import type { CartLine } from "./types";

export type TicketPrintMode = "kitchen-order" | "customer-receipt";

export function printModeFromIntent(intent: KitchenOrderIntent): TicketPrintMode {
  return intent === "paid" ? "kitchen-order" : "customer-receipt";
}

type OrderServiceMode = "takeout" | "dine_in";

const DIVIDER = "--------------------------------";

type TicketFormatParams = OrderTotals & {
  mode: TicketPrintMode;
  paymentReferenceId: string;
  customerName: string;
  serviceMode?: OrderServiceMode;
  currency: string;
  lines: CartLine[];
  printedAt: Date;
};

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

function appendLineItems(rows: string[], lines: CartLine[], withPrices: boolean): void {
  const lineWidth = DIVIDER.length;

  for (const line of lines) {
    const label = line.itemLabel ?? line.id;
    if (withPrices) {
      rows.push(
        formatAlignedRow(`${line.quantity}x ${label}`, line.lineExtendedTotalCents, lineWidth),
      );
      if (line.quantity > 1) {
        rows.push(`   ${formatMoneyAmount(line.lineUnitTotalCents)} each`);
      }
    } else {
      rows.push(`${line.quantity}x ${label}`);
    }
    const selectionRows = line.selectionLines ?? [];
    for (const selection of selectionRows) {
      rows.push(`   ${selection}`);
    }
  }
}

function formatKitchenOrderTicket(params: TicketFormatParams): string {
  const { customerName, serviceMode, lines, printedAt } = params;
  const rows: string[] = [
    `Time: ${printedAt.toISOString()}`,
    `Name: ${customerName.trim()}`,
    `Service: ${serviceModeLabel(serviceMode)}`,
    DIVIDER,
  ];

  appendLineItems(rows, lines, false);
  rows.push(DIVIDER);
  rows.push("");

  return rows.join("\n");
}

function formatCustomerReceipt(params: TicketFormatParams): string {
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
  const lineWidth = DIVIDER.length;
  const rows: string[] = [
    "RICOS — KITCHEN TICKET",
    DIVIDER,
    `Ref: ${paymentReferenceId}`,
    `Time: ${printedAt.toISOString()}`,
    `Name: ${customerName.trim()}`,
    `Service: ${serviceModeLabel(serviceMode)}`,
    DIVIDER,
  ];

  appendLineItems(rows, lines, true);
  rows.push(DIVIDER);
  rows.push(formatTotalsLine("SUBTOTAL", subtotalCents, lineWidth));
  rows.push(formatTotalsLine("SERVICE CHARGE", serviceChargeCents, lineWidth));
  rows.push(formatTotalsLine("SALES TAX", salesTaxCents, lineWidth));
  rows.push(formatTotalsLine("MUNICIPAL TAX", municipalTaxCents, lineWidth));
  rows.push(formatTotalsLine("TOTAL", grandTotalCents, lineWidth));
  rows.push(DIVIDER);
  rows.push("");

  return rows.join("\n");
}

export function formatTicket(params: TicketFormatParams): string {
  return params.mode === "kitchen-order"
    ? formatKitchenOrderTicket(params)
    : formatCustomerReceipt(params);
}
