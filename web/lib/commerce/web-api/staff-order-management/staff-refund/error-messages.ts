export const STAFF_REFUND_ERROR_MESSAGES: Record<string, string> = {
  order_not_found: "Order not found.",
  already_refunded: "This order was already refunded.",
  cannot_refund_order_status: "This order cannot be refunded in its current status.",
  refund_exceeds_order_total: "Refund amount exceeds the order total.",
  server_misconfigured: "Refund could not be processed (server misconfigured).",
  stripe_refund_failed: "Stripe refund failed. Try again or check Stripe.",
  solana_refund_failed: "Solana refund failed. Try again or check server logs.",
  payment_payer_not_found: "Could not find the original Solana payer for this order.",
  missing_payment_reference: "This order has no Solana payment reference for automated refund.",
};

export function staffRefundBusinessMessage(errorCode: string): string {
  return STAFF_REFUND_ERROR_MESSAGES[errorCode] ?? errorCode;
}
