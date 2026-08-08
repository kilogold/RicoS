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
import { executeSolanaStaffRefund } from "@/lib/commerce/web-api/staff-order-management/staff-refund/execute-solana-refund";
import { executeAthStaffRefund } from "@/lib/commerce/web-api/staff-order-management/staff-refund/execute-ath-refund";

export type StaffRefundOrderInput = {
  orderReference: string;
  amountCents: number;
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
        | "server_misconfigured"
        | "stripe_refund_failed"
        | "solana_refund_failed"
        | "ath_refund_failed"
        | "payment_payer_not_found"
        | "missing_payment_reference";
      detail?: string;
    };

/**
 * Staff refund: Stripe Refund API, ATH Móvil Refund API, or Solana proof row;
 * status → `refunding` / `refunded`.
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
  } else if (order.paymentProvider === "athmovil") {
    const reserved = await tryInsertRefundIfWithinOrderTotal(db, {
      orderReference,
      amountCents,
    });
    if (!reserved) return { ok: false, code: "refund_exceeds_order_total" };

    const sent = await executeAthStaffRefund({ order, amountCents });
    if (!sent.ok) {
      try {
        await deleteRefund(db, reserved.id);
      } catch (rollbackErr) {
        const rollbackMessage =
          rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr);
        console.error("refund reservation rollback failed:", rollbackMessage);
      }
      return { ok: false, code: sent.code, detail: sent.detail };
    }

    try {
      await updateRefundConfirmation(db, reserved.id, {
        athRefundReferenceNumber: sent.athRefundReferenceNumber,
      });
    } catch (confirmErr) {
      const confirmMessage =
        confirmErr instanceof Error ? confirmErr.message : String(confirmErr);
      console.error(
        "ath refund sent but confirmation update failed:",
        sent.athRefundReferenceNumber,
        confirmMessage,
      );
      return {
        ok: false,
        code: "ath_refund_failed",
        detail: `ATH refund sent (${sent.athRefundReferenceNumber}) but confirmation failed`,
      };
    }
  } else if (order.paymentProvider === "helius") {
    const reserved = await tryInsertRefundIfWithinOrderTotal(db, {
      orderReference,
      amountCents,
    });
    if (!reserved) return { ok: false, code: "refund_exceeds_order_total" };

    const sent = await executeSolanaStaffRefund({ order, amountCents });
    if (!sent.ok) {
      try {
        await deleteRefund(db, reserved.id);
      } catch (rollbackErr) {
        const rollbackMessage =
          rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr);
        console.error("refund reservation rollback failed:", rollbackMessage);
      }
      return { ok: false, code: sent.code, detail: sent.detail };
    }

    try {
      await updateRefundConfirmation(db, reserved.id, {
        solanaRefundTransactionSignature: sent.transactionSignature,
      });
    } catch (confirmErr) {
      const confirmMessage =
        confirmErr instanceof Error ? confirmErr.message : String(confirmErr);
      console.error(
        "solana refund sent but confirmation update failed:",
        sent.transactionSignature,
        confirmMessage,
      );
      return {
        ok: false,
        code: "solana_refund_failed",
        detail: `On-chain refund sent (${sent.transactionSignature}) but confirmation failed`,
      };
    }
  } else {
    // Exhaustiveness guard: fails the build if IngressProvider grows without a matching branch here.
    const unhandledProvider: never = order.paymentProvider;
    throw new Error(`staffRefundOrder: unsupported payment provider "${String(unhandledProvider)}"`);
  }

  const total = await sumConfirmedRefundsForOrder(db, orderReference);
  const nextStatus: PurchaseOrderStatus =
    total >= order.grandTotalCents ? "refunded" : "refunding";
  await setPurchaseOrderStatus(db, orderReference, nextStatus);

  return {
    ok: true,
    orderReference,
    refundedTotalCents: total,
    status: nextStatus,
  };
}
