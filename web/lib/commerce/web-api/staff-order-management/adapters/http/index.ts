import { publishMenuFromRepoFile } from "@/lib/commerce/web-api/staff-order-management/use-cases/publish-menu-from-repo-file";
import { fulfillPurchaseOrder } from "@/lib/commerce/web-api/staff-order-management/use-cases/fulfill-purchase-order";
import { recoverSolanaPendingPayment } from "@/lib/commerce/web-api/staff-order-management/use-cases/recover-solana-pending-payment";
import { staffRefundOrder } from "@/lib/commerce/web-api/staff-order-management/use-cases/staff-refund-order";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  listPurchaseOrdersCreatedBetween,
  listRefundsForOrders,
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

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const MS_PER_DAY = HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MS_PER_SECOND;

/** Wider ranges explode response size and DB work for a single request. */
const MAX_ORDER_LIST_RANGE_DAYS = 8;
const MAX_ORDER_LIST_RANGE_MS = MAX_ORDER_LIST_RANGE_DAYS * MS_PER_DAY;

export async function handleStaffListOrdersRequest(req: Request): Promise<Response> {
  if (!verifyStaffPublishAuth(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const fromRaw = url.searchParams.get("from");
  const toRaw = url.searchParams.get("to");
  let fromMs: number;
  let toMs: number;
  if (fromRaw !== null && toRaw !== null) {
    fromMs = Number(fromRaw);
    toMs = Number(toRaw);
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs) {
      return NextResponse.json({ error: "invalid_range" }, { status: 400 });
    }
  } else {
    const now = Date.now();
    const d = new Date(now);
    const startUtc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    fromMs = startUtc;
    toMs = now;
  }

  if (toMs - fromMs > MAX_ORDER_LIST_RANGE_MS) {
    return NextResponse.json({ error: "range_too_large" }, { status: 400 });
  }

  const db = await getWebhookDb();
  const rows = await listPurchaseOrdersCreatedBetween(db, fromMs, toMs);
  const orderRefs = rows.map((r) => r.orderReference);
  const refundsByOrder = await listRefundsForOrders(db, orderRefs);

  const orders = rows.map((r) => {
    const refunds = (refundsByOrder.get(r.orderReference) ?? []).map((ref) => ({
      id: ref.id,
      amountCents: ref.amountCents,
      createdAt: ref.createdAt,
      confirmedAt: ref.confirmedAt ?? null,
      stripeRefundConfirmation: ref.stripeRefundConfirmation ?? null,
      solanaRefundTransactionSignature: ref.solanaRefundTransactionSignature ?? null,
    }));
    return {
      orderReference: r.orderReference,
      paymentProvider: r.paymentProvider,
      amountCents: r.amountCents,
      currency: r.currency,
      status: r.status,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      customerName: r.customerName,
      customerPhone: r.customerPhone,
      customerEmail: r.customerEmail,
      /** Parsed `payload_json` from `purchase_orders`. */
      payload: r.payload,
      lineCount: r.payload.lines.length,
      summaryLabel:
        r.payload.lines[0]?.itemLabel ??
        (r.payload.lines[0] ? `Line ${r.payload.lines[0].id}` : "—"),
      refunds,
    };
  });

  return NextResponse.json({ orders, from: fromMs, to: toMs });
}

export async function handleStaffFulfillmentRequest(req: Request): Promise<Response> {
  if (!verifyStaffPublishAuth(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { orderReference?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const orderReference = body.orderReference;
  if (typeof orderReference !== "string" || !orderReference.trim()) {
    return NextResponse.json({ error: "invalid_orderReference" }, { status: 400 });
  }

  const db = await getWebhookDb();
  const result = await fulfillPurchaseOrder(db, orderReference);
  if (!result.ok) {
    if (result.error === "not_found") {
      return NextResponse.json({ error: "order_not_found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: "cannot_fulfill", status: result.status },
      { status: 409 },
    );
  }

  return NextResponse.json({ orderReference: result.orderReference, status: "fulfilled" });
}

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
  const result = await staffRefundOrder(db, {
    orderReference,
    amountCents,
    solanaRefundTransactionSignature:
      typeof body.solanaRefundTransactionSignature === "string"
        ? body.solanaRefundTransactionSignature
        : undefined,
    idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : undefined,
  });

  if (!result.ok) {
    const statusByCode: Record<
      NonNullable<(typeof result)["code"]>,
      number
    > = {
      order_not_found: 404,
      already_refunded: 409,
      cannot_refund_order_status: 409,
      refund_exceeds_order_total: 409,
      missing_solana_signature: 400,
      server_misconfigured: 500,
      stripe_refund_failed: 502,
    };
    const status = statusByCode[result.code];
    const payload: Record<string, string> = { error: result.code };
    if (result.detail) payload.detail = result.detail;
    return NextResponse.json(payload, { status });
  }

  return NextResponse.json({
    orderReference: result.orderReference,
    refundedTotalCents: result.refundedTotalCents,
    status: result.status,
  });
}

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
  const result = await recoverSolanaPendingPayment(db, orderReference, transactionSignature);

  if (!result.ok) {
    if ("error" in result) {
      const status =
        result.error === "pending_payment_not_found"
          ? 404
          : 400;
      return NextResponse.json({ error: result.error }, { status });
    }
    return NextResponse.json(result.body, { status: result.status });
  }

  return NextResponse.json({ recovered: true });
}
