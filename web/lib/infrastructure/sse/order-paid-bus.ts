import type { KitchenOrderPayload } from "@/lib/infrastructure/turso/commerce-db";

type OrderPaidListener = (payload: KitchenOrderPayload) => void;

type BusState = {
  listeners: Set<OrderPaidListener>;
};

const state = globalThis as typeof globalThis & { __ricosOrderPaidBus?: BusState };

if (!state.__ricosOrderPaidBus) {
  state.__ricosOrderPaidBus = {
    listeners: new Set<OrderPaidListener>(),
  };
}

const bus = state.__ricosOrderPaidBus;

export function publishOrderPaid(payload: KitchenOrderPayload): void {
  for (const listener of bus.listeners) {
    try {
      listener(payload);
    } catch (err) {
      console.error("order.paid listener failed:", err);
    }
  }
}

export function subscribeOrderPaid(listener: OrderPaidListener): () => void {
  bus.listeners.add(listener);
  return () => {
    bus.listeners.delete(listener);
  };
}
