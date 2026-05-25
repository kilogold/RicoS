import type { RefundPayloadForHash } from "@/lib/commerce/web-api/staff-order-management/staff-refund/payload-hash";

export type ParsedStaffRefundPayload = RefundPayloadForHash;

export function parseStaffRefundBody(body: {
  orderReference?: unknown;
  amountCents?: unknown;
  solanaRefundTransactionSignature?: unknown;
  idempotencyKey?: unknown;
}):
  | { ok: true; payload: ParsedStaffRefundPayload }
  | { ok: false; error: string } {
  const orderReference = body.orderReference;
  const amountCents = body.amountCents;
  if (typeof orderReference !== "string" || !orderReference.trim()) {
    return { ok: false, error: "invalid_orderReference" };
  }
  if (
    typeof amountCents !== "number" ||
    !Number.isInteger(amountCents) ||
    amountCents <= 0
  ) {
    return { ok: false, error: "invalid_amountCents" };
  }

  const payload: ParsedStaffRefundPayload = {
    orderReference: orderReference.trim(),
    amountCents,
  };

  if (typeof body.solanaRefundTransactionSignature === "string") {
    const sig = body.solanaRefundTransactionSignature.trim();
    if (sig) payload.solanaRefundTransactionSignature = sig;
  }
  if (typeof body.idempotencyKey === "string") {
    const key = body.idempotencyKey.trim();
    if (key) payload.idempotencyKey = key;
  }

  return { ok: true, payload };
}
