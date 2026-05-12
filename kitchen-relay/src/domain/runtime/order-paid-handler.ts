import {
  appendDeadLetter,
  formatTicket,
  printWithRetries,
  type PrinterAdapter,
} from "../../component/ticket-printing/service";
import { postPrintAck } from "../relay/ack";
import type { OrderPaidPayload } from "../relay/types";
import type { IdempotencyStore } from "../idempotency";

export function createOrderPaidHandler(
  idempotency: IdempotencyStore,
  printer: PrinterAdapter,
  printMaxAttempts: number,
  printRetryInitialDelayMs: number,
  backendBase: string,
  printAckSecret: string | undefined,
  deadLetterPath: string | undefined,
): (data: OrderPaidPayload) => Promise<void> {
  return async (data: OrderPaidPayload): Promise<void> => {
    const eventId = data.paymentIngressEventId;

    const shouldProcess = await idempotency.tryCommit(eventId);
    if (!shouldProcess) {
      try {
        await postPrintAck({
          backendBase,
          printAckSecret,
          paymentIngressEventId: eventId,
        });
      } catch (err) {
        console.error("print-ack retry after idempotent skip failed:", err);
      }
      return;
    }

    const text = formatTicket({
      paymentReferenceId: data.paymentReferenceId,
      customerName: data.customerName,
      serviceMode: data.serviceMode,
      amountCents: data.amountCents,
      currency: data.currency,
      lines: data.lines,
      printedAt: new Date(),
    });

    try {
      await printWithRetries(printer, text, {
        maxAttempts: printMaxAttempts,
        initialDelayMs: printRetryInitialDelayMs,
      });
      await postPrintAck({
        backendBase,
        printAckSecret,
        paymentIngressEventId: eventId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Print failed after retries:", message);
      if (deadLetterPath) {
        try {
          await appendDeadLetter(deadLetterPath, text, {
            eventId,
            message,
          });
        } catch (dlErr) {
          console.error("Dead-letter write failed:", dlErr);
        }
      }
    }
  };
}
