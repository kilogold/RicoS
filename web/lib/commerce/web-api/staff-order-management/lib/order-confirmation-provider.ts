export const ORDER_CONFIRMATION_PROVIDERS = ["stripe", "solana", "ath-movil"] as const;

export type OrderConfirmationProvider = (typeof ORDER_CONFIRMATION_PROVIDERS)[number];

export function parseOrderConfirmationProvider(
  value: string | null,
): OrderConfirmationProvider | null {
  if (value === "stripe" || value === "solana" || value === "ath-movil") return value;
  return null;
}
