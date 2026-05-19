import type { PrintStation, PurchaseOrderLine } from "@ricos/shared";
import type { OrderPaidPayload } from "../relay/types";

export type PrintDestination = "A" | "B";

export type PrintSlice = {
  destination: PrintDestination;
  lines: PurchaseOrderLine[];
};

export function resolveDestination(station: PrintStation): PrintDestination {
  return station === "B" ? "B" : "A";
}

export function assertPrintableOrderLines(lines: PurchaseOrderLine[], printJobId: string): void {
  for (const line of lines) {
    if (line.station !== "A" && line.station !== "B" && line.station !== "default") {
      throw new Error(`Print job ${printJobId}: line ${line.id} missing valid station`);
    }
    if (typeof line.itemLabel !== "string" || !line.itemLabel.trim()) {
      throw new Error(`Print job ${printJobId}: line ${line.id} missing itemLabel`);
    }
    if (!Array.isArray(line.selectionLines)) {
      throw new Error(`Print job ${printJobId}: line ${line.id} missing selectionLines`);
    }
  }
}

export function planPrintSlices(
  payload: OrderPaidPayload,
  dualPrinter: boolean,
): PrintSlice[] {
  if (payload.intent === "manual-print") {
    return [{ destination: "A", lines: payload.lines }];
  }

  if (!dualPrinter) {
    return [{ destination: "A", lines: payload.lines }];
  }

  const byDestination: Record<PrintDestination, PurchaseOrderLine[]> = { A: [], B: [] };
  for (const line of payload.lines) {
    byDestination[resolveDestination(line.station)].push(line);
  }

  const slices: PrintSlice[] = [];
  if (byDestination.A.length > 0) {
    slices.push({ destination: "A", lines: byDestination.A });
  }
  if (byDestination.B.length > 0) {
    slices.push({ destination: "B", lines: byDestination.B });
  }
  return slices;
}
