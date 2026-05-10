import { publishMenuFromRepoFile } from "@/lib/commerce/web-api/staff-order-management/use-cases/publish-menu-from-repo-file";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { NormalizedIngressEvent } from "@/lib/commerce/domain";
import { executeSolanaIngressEvent } from "@/lib/commerce/web-api/kitchen-order-dispatch/use-cases/execute-ingress-event";
import { getStripeServerClient } from "@/lib/infrastructure/stripe/server-client";
import {
  deleteRefund,
  getPendingPaymentsByReferences,
  getPurchaseOrderByReference,
  setPurchaseOrderStatus,
  sumConfirmedRefundsForOrder,
  tryInsertRefundIfWithinOrderTotal,
  updateRefundConfirmation,
} from "@/lib/infrastructure/turso/webhook-db";
import { getWebhookDb } from "@/lib/infrastructure/turso/webhook-db-runtime";

function verifyStaffPublishAuth(authorizationHeader: string | null): boolean {
  const secret = process.env.STAFF_MENU_PUBLISH_SECRET?.trim();
  if (!secret) {
    return false;
  }
  const header = authorizationHeader ?? "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) {
    return false;
  }
  const token = header.slice(prefix.length);
  try {
    const a = Buffer.from(token);
    const b = Buffer.from(secret);
    if (a.length !== b.length) {
      return false;
    }
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function handleStaffMenuPublishRequest(
  authorizationHeader: string | null,
): Promise<Response> {
  if (!verifyStaffPublishAuth(authorizationHeader)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const out = await publishMenuFromRepoFile();
    return NextResponse.json(out);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/**
 * Staff-initiated refund. Sole entry point for refunding a settled purchase.
 * Stripe path calls the Refund API; Solana path requires a pre-broadcast tx signature
 * (staff sends the on-chain payout out-of-band, then submits the signature here).
 * Status: → `refunding`, then → `refunded` once confirmed `SUM(amount_cents) >= order.amountCents`.
 */
export async function handleStaffRefundRequest(req: Request): Promise<Response> {
  if (!verifyStaffPublishAuth(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: {
    orderReference?: unknown;
    amountCents?: unknown;
    solanaRefundTransactionSignature?: unknown;
    idempotencyKey?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const orderReference = body.orderReference;
  const amountCents = body.amountCents;
  const solanaSig = body.solanaRefundTransactionSignature;
  const idempotencyKey = body.idempotencyKey;

  if (typeof orderReference !== "string" || !orderReference.trim()) {
    return NextResponse.json({ error: "invalid_orderReference" }, { status: 400 });
  }
  if (
    typeof amountCents !== "number" ||
    !Number.isInteger(amountCents) ||
    amountCents <= 0
  ) {
    return NextResponse.json({ error: "invalid_amountCents" }, { status: 400 });
  }

  const db = await getWebhookDb();
  const order = await getPurchaseOrderByReference(db, orderReference);
  if (!order) return NextResponse.json({ error: "order_not_found" }, { status: 404 });
  if (order.status === "refunded") {
    return NextResponse.json({ error: "already_refunded" }, { status: 409 });
  }

  if (order.paymentProvider === "stripe") {
    let stripe;
    try {
      stripe = getStripeServerClient();
    } catch {
      return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
    }

    // Atomically reserve a proof-null refund row. If the reservation would push
    // the order over its total, abort BEFORE calling Stripe — otherwise a
    // concurrent racer could leave us with a real Stripe refund and no DB record.
    const reserved = await tryInsertRefundIfWithinOrderTotal(db, {
      orderReference,
      amountCents,
    });
    if (!reserved) {
      return NextResponse.json({ error: "refund_exceeds_order_total" }, { status: 409 });
    }

    let stripeRefundId: string;
    try {
      const re = await stripe.refunds.create(
        { payment_intent: orderReference, amount: amountCents },
        typeof idempotencyKey === "string" && idempotencyKey ? { idempotencyKey } : undefined,
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
      return NextResponse.json({ error: "stripe_refund_failed", detail: message }, { status: 502 });
    }

    await updateRefundConfirmation(db, reserved.id, {
      stripeRefundConfirmation: stripeRefundId,
    });
  } else {
    if (typeof solanaSig !== "string" || !solanaSig.trim()) {
      return NextResponse.json({ error: "missing_solana_signature" }, { status: 400 });
    }
    // Signature already exists on-chain; insert with proof in a single
    // conditional statement — the same statement enforces overdraw atomically.
    const inserted = await tryInsertRefundIfWithinOrderTotal(db, {
      orderReference,
      amountCents,
      solanaRefundTransactionSignature: solanaSig.trim(),
    });
    if (!inserted) {
      return NextResponse.json({ error: "refund_exceeds_order_total" }, { status: 409 });
    }
  }

  const total = await sumConfirmedRefundsForOrder(db, orderReference);
  const nextStatus = total >= order.amountCents ? "refunded" : "refunding";
  await setPurchaseOrderStatus(db, orderReference, nextStatus);

  return NextResponse.json({
    orderReference,
    refundedTotalCents: total,
    status: nextStatus,
  });
}

/**
 * Solana manual recovery: re-runs the same atomic ingress writes as the happy-path
 * webhook for a `pending_payments` row whose on-chain payment landed but was missed
 * (TTL elapsed, webhook outage). Idempotent on `evt_helius_<signature>`.
 */
export async function handleSolanaManualRecoverRequest(req: Request): Promise<Response> {
  if (!verifyStaffPublishAuth(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { orderReference?: unknown; transactionSignature?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const orderReference = body.orderReference;
  const transactionSignature = body.transactionSignature;
  if (typeof orderReference !== "string" || !orderReference.trim()) {
    return NextResponse.json({ error: "invalid_orderReference" }, { status: 400 });
  }
  if (typeof transactionSignature !== "string" || !transactionSignature.trim()) {
    return NextResponse.json({ error: "invalid_transactionSignature" }, { status: 400 });
  }

  const db = await getWebhookDb();
  const pending = (await getPendingPaymentsByReferences(db, [orderReference])).get(orderReference);
  if (!pending) {
    return NextResponse.json({ error: "pending_payment_not_found" }, { status: 404 });
  }

  let meta: { metadata?: Record<string, string | undefined>; amountCents?: number; currency?: string };
  try {
    meta = JSON.parse(pending.metadataJson);
  } catch {
    return NextResponse.json({ error: "invalid_pending_metadata" }, { status: 400 });
  }
  if (
    typeof meta.amountCents !== "number" ||
    typeof meta.currency !== "string" ||
    typeof meta.metadata !== "object" ||
    meta.metadata === null
  ) {
    return NextResponse.json({ error: "invalid_pending_metadata" }, { status: 400 });
  }

  const event: NormalizedIngressEvent = {
    provider: "helius",
    paymentIngressEventId: `evt_helius_${transactionSignature}`,
    paymentReferenceId: orderReference,
    amountCents: meta.amountCents,
    currency: meta.currency,
    metadata: meta.metadata,
  };

  const outcome = await executeSolanaIngressEvent(db, event, {
    orderReference,
    transactionSignature,
  });
  if (!outcome.ok) {
    return NextResponse.json(outcome.body, { status: outcome.status });
  }

  console.log(
    JSON.stringify({
      scope: "solana_recover_manual",
      orderReference,
      transactionSignature,
      at: Date.now(),
    }),
  );

  return NextResponse.json({ recovered: true });
}
