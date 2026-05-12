import type { Client } from "@libsql/client";
import { getStripeServerClient } from "@/lib/infrastructure/stripe/server-client";
import {
  type PurchaseOrderStatus,
  deleteRefund,
  getPurchaseOrderByReference,
  setPurchaseOrderStatus,
  sumConfirmedRefundsForOrder,
  tryInsertRefundIfWithinOrderTotal,
  updateRefundConfirmation,
} from "@/lib/infrastructure/turso/webhook-db";

export type StaffRefundOrderInput = {
  orderReference: string;
  amountCents: number;
  solanaRefundTransactionSignature?: string;
  idempotencyKey?: string;
};

export type StaffRefundOrderResult =
  | {
      ok: true;
      orderReference: string;
      refundedTotalCents: number;
      status: PurchaseOrderStatus;
    }
  | {
      ok: false;
      code:
        | "order_not_found"
        | "already_refunded"
        | "cannot_refund_order_status"
        | "refund_exceeds_order_total"
        | "missing_solana_signature"
        | "server_misconfigured"
        | "stripe_refund_failed";
      detail?: string;
    };

/**
 * Staff refund: Stripe Refund API or Solana proof row; status → `refunding` / `refunded`.
 */
export async function staffRefundOrder(
  db: Client,
  input: StaffRefundOrderInput,
): Promise<StaffRefundOrderResult> {
  const orderReference = input.orderReference.trim();
  const { amountCents } = input;

  const order = await getPurchaseOrderByReference(db, orderReference);
  if (!order) return { ok: false, code: "order_not_found" };
  if (order.status === "refunded") return { ok: false, code: "already_refunded" };
  if (order.status === "pending" || order.status === "expired") {
    return { ok: false, code: "cannot_refund_order_status", detail: order.status };
  }

  if (order.paymentProvider === "stripe") {
    let stripe;
    try {
      stripe = getStripeServerClient();
    } catch {
      return { ok: false, code: "server_misconfigured" };
    }

    const reserved = await tryInsertRefundIfWithinOrderTotal(db, {
      orderReference,
      amountCents,
    });
    if (!reserved) return { ok: false, code: "refund_exceeds_order_total" };

    const idem =
      typeof input.idempotencyKey === "string" && input.idempotencyKey.trim()
        ? input.idempotencyKey.trim()
        : undefined;

    let stripeRefundId: string;
    try {
      const re = await stripe.refunds.create(
        { payment_intent: orderReference, amount: amountCents },
        idem ? { idempotencyKey: idem } : undefined,
      );
      stripeRefundId = re.id;
    } catch (err) {
      try {
        await deleteRefund(db, reserved.id);
      } catch (rollbackErr) {
        const rollbackMessage =
          rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr);
        console.error("refund reservation rollback failed:", rollbackMessage);
      }
      const message = err instanceof Error ? err.message : String(err);
      console.error("stripe refund failed:", message);
      return { ok: false, code: "stripe_refund_failed", detail: message };
    }

    await updateRefundConfirmation(db, reserved.id, {
      stripeRefundConfirmation: stripeRefundId,
    });
  } else {
    const sig = input.solanaRefundTransactionSignature?.trim();
    if (!sig) return { ok: false, code: "missing_solana_signature" };

    const inserted = await tryInsertRefundIfWithinOrderTotal(db, {
      orderReference,
      amountCents,
      solanaRefundTransactionSignature: sig,
    });
    if (!inserted) return { ok: false, code: "refund_exceeds_order_total" };
  }

  const total = await sumConfirmedRefundsForOrder(db, orderReference);
  const nextStatus: PurchaseOrderStatus =
    total >= order.amountCents ? "refunded" : "refunding";
  await setPurchaseOrderStatus(db, orderReference, nextStatus);

  return {
    ok: true,
    orderReference,
    refundedTotalCents: total,
    status: nextStatus,
  };
}
