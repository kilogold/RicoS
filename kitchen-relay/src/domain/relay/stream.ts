import { isKitchenOrderIntent } from "@ricos/shared";
import EventSource from "eventsource";
import type { OrderPaidPayload } from "./types";

function isValidOrderPaidPayload(data: OrderPaidPayload): boolean {
  return (
    typeof data.paymentIngressEventId === "string" &&
    typeof data.paymentReferenceId === "string" &&
    typeof data.customerName === "string" &&
    typeof data.subtotalCents === "number" &&
    typeof data.serviceChargeCents === "number" &&
    typeof data.salesTaxCents === "number" &&
    typeof data.municipalTaxCents === "number" &&
    typeof data.grandTotalCents === "number" &&
    typeof data.currency === "string" &&
    Array.isArray(data.lines) &&
    isKitchenOrderIntent(data.intent)
  );
}

export function subscribeOrderPaidStream(
  backendBase: string,
  onOrderPaid: (payload: OrderPaidPayload) => void,
  onError?: (error: unknown) => void,
): EventSource {
  const streamUrl = `${backendBase}/api/events/stream`;
  const eventSource = new EventSource(streamUrl);

  eventSource.addEventListener("order.paid", (msg) => {
    if (!msg.data) return;
    let data: OrderPaidPayload;
    try {
      data = JSON.parse(msg.data) as OrderPaidPayload;
    } catch {
      console.error("Invalid order.paid JSON");
      return;
    }
    if (!isValidOrderPaidPayload(data)) {
      console.error("Invalid order.paid payload shape");
      return;
    }
    onOrderPaid(data);
  });

  eventSource.onerror = (error) => {
    onError?.(error);
  };

  return eventSource;
}
