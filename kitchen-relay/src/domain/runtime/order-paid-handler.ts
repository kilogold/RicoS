import {
  formatTicket,
  printModeFromIntent,
  printWithRetries,
  type PrinterAdapter,
} from "../../component/ticket-printing/service";
import { toCartLines } from "../../component/ticket-printing/to-cart-lines";
import { postPrintAck } from "../relay/ack";
import type { PrintJobHandlerInput } from "../relay/types";
import {
  allDestinationsDone,
  clearPrintJobState,
  getDestinationState,
  getOrCreatePrintJobState,
  markDestinationDone,
  markDestinationFailed,
} from "./print-job-state";
import { assertPrintableOrderLines, planPrintSlices, type PrintDestination } from "./print-routing";

export type PrintJobPrinters = {
  printerA: PrinterAdapter;
  printerB: PrinterAdapter | null;
};

export function createPrintJobHandler(
  printers: PrintJobPrinters,
  printMaxAttempts: number,
  printRetryInitialDelayMs: number,
  backendBase: string,
  printAckSecret: string | undefined,
): (job: PrintJobHandlerInput) => Promise<void> {
  return async (job: PrintJobHandlerInput): Promise<void> => {
    const { printJobId, payload: data } = job;
    assertPrintableOrderLines(data.lines, printJobId);
    const dualPrinter = printers.printerB != null;
    const slices = planPrintSlices(data, dualPrinter);

    if (slices.length === 0) {
      await postPrintAck({ backendBase, printAckSecret, printJobId });
      return;
    }

    const destinations = slices.map((s) => s.destination);
    const state = getOrCreatePrintJobState(printJobId, destinations);

    for (const slice of slices) {
      const destState = getDestinationState(state, slice.destination);
      if (destState.status === "done") {
        continue;
      }

      const text = formatTicket({
        mode: printModeFromIntent(data.intent),
        paymentReferenceId: data.paymentReferenceId,
        customerName: data.customerName,
        serviceMode: data.serviceMode,
        subtotalCents: data.subtotalCents,
        serviceChargeCents: data.serviceChargeCents,
        salesTaxCents: data.salesTaxCents,
        municipalTaxCents: data.municipalTaxCents,
        grandTotalCents: data.grandTotalCents,
        currency: data.currency,
        lines: toCartLines(slice.lines),
        printedAt: new Date(),
      });

      const adapter = printerForDestination(printers, slice.destination);
      try {
        await printWithRetries(adapter, text, {
          maxAttempts: printMaxAttempts,
          initialDelayMs: printRetryInitialDelayMs,
        });
        markDestinationDone(state, slice.destination);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        markDestinationFailed(state, slice.destination, message);
        console.error("Print job partial failure:", { printJobId, state });
        throw err;
      }
    }

    if (allDestinationsDone(state)) {
      await postPrintAck({ backendBase, printAckSecret, printJobId });
      clearPrintJobState(printJobId);
    }
  };
}

function printerForDestination(
  printers: PrintJobPrinters,
  destination: PrintDestination,
): PrinterAdapter {
  if (destination === "B") {
    if (!printers.printerB) {
      throw new Error("Printer B not configured");
    }
    return printers.printerB;
  }
  return printers.printerA;
}
