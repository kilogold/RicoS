import type { getAppStrings } from "@/lib/i18n";
import {
  ORDER_CONFIRMATION_ERROR_CODE,
  type OrderConfirmationErrorCode,
} from "@/lib/commerce/order-confirmation";

export type ConfirmationApiResponse =
  | { ok: true; orderStatus: string; provider?: string }
  | { ok: false; code: OrderConfirmationErrorCode; detail?: string; provider?: string };

export const CONFIRMED_ORDER_STATUSES = new Set([
  "paid",
  "acknowledged",
  "fulfilled",
  "refunding",
  "refunded",
]);

export function isOrderConfirmed(orderStatus: string): boolean {
  return CONFIRMED_ORDER_STATUSES.has(orderStatus);
}

export function errorMessageForCode(
  code: OrderConfirmationErrorCode,
  copy: ReturnType<typeof getAppStrings>,
): string {
  switch (code) {
    case ORDER_CONFIRMATION_ERROR_CODE.MISSING_ORDER:
      return copy.orderConfirmationMissingOrder;
    case ORDER_CONFIRMATION_ERROR_CODE.PAYMENT_EXPIRED:
      return copy.orderConfirmationPaymentExpired;
    case ORDER_CONFIRMATION_ERROR_CODE.PAYMENT_NOT_SUCCEEDED:
      return copy.orderConfirmationPaymentFailed;
    case ORDER_CONFIRMATION_ERROR_CODE.INVALID_PAYMENT_INTENT:
    case ORDER_CONFIRMATION_ERROR_CODE.INVALID_REFERENCE:
    case ORDER_CONFIRMATION_ERROR_CODE.INVALID_PROVIDER:
    case ORDER_CONFIRMATION_ERROR_CODE.INVALID_SESSION:
      return copy.orderConfirmationInvalidSession;
    case ORDER_CONFIRMATION_ERROR_CODE.ORDER_NOT_CONFIRMED:
    default:
      return copy.orderConfirmationNotConfirmed;
  }
}

export async function fetchOrderConfirmationStatus(
  params: URLSearchParams,
): Promise<ConfirmationApiResponse | null> {
  try {
    const res = await fetch(`/api/order/confirmation-status?${params.toString()}`, {
      cache: "no-store",
    });
    return (await res.json()) as ConfirmationApiResponse;
  } catch {
    return null;
  }
}
