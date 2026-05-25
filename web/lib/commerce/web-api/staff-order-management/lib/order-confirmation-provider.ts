export const ORDER_CONFIRMATION_PROVIDERS = ["stripe", "solana"] as const;

export type OrderConfirmationProvider = (typeof ORDER_CONFIRMATION_PROVIDERS)[number];

export function parseOrderConfirmationProvider(
  value: string | null,
): OrderConfirmationProvider | null {
  if (value === "stripe" || value === "solana") return value;
  return null;
}
