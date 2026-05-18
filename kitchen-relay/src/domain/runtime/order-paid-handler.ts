import {
  formatTicket,
  printModeFromIntent,
  printWithRetries,
  type PrinterAdapter,
} from "../../component/ticket-printing/service";
import { postPrintAck } from "../relay/ack";
import type { PrintJobHandlerInput } from "../relay/types";

export function createPrintJobHandler(
  printer: PrinterAdapter,
  printMaxAttempts: number,
  printRetryInitialDelayMs: number,
  backendBase: string,
  printAckSecret: string | undefined,
): (job: PrintJobHandlerInput) => Promise<void> {
  return async (job: PrintJobHandlerInput): Promise<void> => {
    const { printJobId, payload: data } = job;

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
      lines: data.lines,
      printedAt: new Date(),
    });

    await printWithRetries(printer, text, {
      maxAttempts: printMaxAttempts,
      initialDelayMs: printRetryInitialDelayMs,
    });
    await postPrintAck({ backendBase, printAckSecret, printJobId });
  };
}
