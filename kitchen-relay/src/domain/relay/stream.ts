import EventSource from "eventsource";
import type { OrderPaidPayload } from "./types";

function isValidOrderPaidPayload(data: OrderPaidPayload): boolean {
  return (
    typeof data.stripeEventId === "string" &&
    typeof data.paymentIntentId === "string" &&
    typeof data.amountCents === "number" &&
    typeof data.currency === "string" &&
    Array.isArray(data.lines)
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
