export const ORDER_CONFIRMATION_ERROR_CODE = {
  MISSING_ORDER: "missing_order",
  PAYMENT_EXPIRED: "payment_expired",
  PAYMENT_NOT_SUCCEEDED: "payment_not_succeeded",
  INVALID_PAYMENT_INTENT: "invalid_payment_intent",
  INVALID_REFERENCE: "invalid_reference",
  INVALID_PROVIDER: "invalid_provider",
  INVALID_SESSION: "invalid_session",
  ORDER_NOT_CONFIRMED: "order_not_confirmed",
} as const;

export type OrderConfirmationErrorCode =
  (typeof ORDER_CONFIRMATION_ERROR_CODE)[keyof typeof ORDER_CONFIRMATION_ERROR_CODE];
