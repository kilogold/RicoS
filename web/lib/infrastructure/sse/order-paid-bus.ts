import type { KitchenOrderPayload } from "@/lib/commerce/domain";

type OrderListener = (payload: KitchenOrderPayload) => void;

type BusRuntimeState = {
  listeners: Set<OrderListener>;
};

const state = globalThis as typeof globalThis & {
  __ricosOrderPaidBus?: BusRuntimeState;
};

if (!state.__ricosOrderPaidBus) {
  state.__ricosOrderPaidBus = { listeners: new Set<OrderListener>() };
}

const runtime = state.__ricosOrderPaidBus;

export function publishOrder(payload: KitchenOrderPayload): void {
  for (const listener of runtime.listeners) {
    try {
      listener(payload);
    } catch (err) {
      console.error("order.paid listener failed:", err);
    }
  }
}

export function subscribeOrder(listener: OrderListener): () => void {
  runtime.listeners.add(listener);
  return () => {
    runtime.listeners.delete(listener);
  };
}
