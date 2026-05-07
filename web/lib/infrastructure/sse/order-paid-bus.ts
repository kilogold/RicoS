import type { KitchenOrderPayload } from "@/lib/commerce/domain";

type OrderPaidListener = (payload: KitchenOrderPayload) => void;

type BusRuntimeState = {
  listeners: Set<OrderPaidListener>;
};

const state = globalThis as typeof globalThis & {
  __ricosOrderPaidBus?: BusRuntimeState;
};

if (!state.__ricosOrderPaidBus) {
  state.__ricosOrderPaidBus = { listeners: new Set<OrderPaidListener>() };
}

const runtime = state.__ricosOrderPaidBus;

export function publishOrderPaid(payload: KitchenOrderPayload): void {
  for (const listener of runtime.listeners) {
    try {
      listener(payload);
    } catch (err) {
      console.error("order.paid listener failed:", err);
    }
  }
}

export function subscribeOrderPaid(listener: OrderPaidListener): () => void {
  runtime.listeners.add(listener);
  return () => {
    runtime.listeners.delete(listener);
  };
}
