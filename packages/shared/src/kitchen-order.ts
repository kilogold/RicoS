export type KitchenOrderIntent = "paid" | "manual-print";

/** Sentinel `paymentIngressEventId` when manual-printing before payment has landed. */
export const PENDING_PAYMENT_NO_SALE_INGRESS_ID = "PENDING PAYMENT. NO SALE." as const;

export function isKitchenOrderIntent(value: unknown): value is KitchenOrderIntent {
  return value === "paid" || value === "manual-print";
}

export function isValidPaymentIngressEventId(id: string): boolean {
  return id.startsWith("evt_") || id === PENDING_PAYMENT_NO_SALE_INGRESS_ID;
}
