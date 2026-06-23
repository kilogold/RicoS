import type { getAppStrings } from "@/lib/i18n";

export type ConfirmationApiResponse =
  | { ok: true; orderStatus: string; provider?: string }
  | { ok: false; code: string; detail?: string; provider?: string };

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

/** @deprecated Use isOrderConfirmed */
export function isAthOrderConfirmed(orderStatus: string): boolean {
  return isOrderConfirmed(orderStatus);
}

export function errorMessageForCode(
  code: string,
  copy: ReturnType<typeof getAppStrings>,
): string {
  switch (code) {
    case "missing_order":
      return copy.orderConfirmationMissingOrder;
    case "payment_expired":
      return copy.orderConfirmationPaymentExpired;
    case "payment_not_succeeded":
      return copy.orderConfirmationPaymentFailed;
    case "invalid_payment_intent":
    case "invalid_reference":
    case "invalid_provider":
    case "invalid_session":
      return copy.orderConfirmationInvalidSession;
    case "order_not_confirmed":
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

export async function sleepUntilNextPoll(
  shouldWake: () => boolean,
  clearWake: () => void,
  intervalMs: number,
): Promise<void> {
  if (shouldWake()) {
    clearWake();
    return;
  }
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearInterval(interval);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, intervalMs);
    const interval = setInterval(() => {
      if (shouldWake()) {
        clearWake();
        finish();
      }
    }, 200);
  });
}
