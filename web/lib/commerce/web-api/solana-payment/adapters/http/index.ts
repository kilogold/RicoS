import type { Client } from "@libsql/client";
import { generateKeyPairSigner } from "@solana/signers";
import { NextResponse } from "next/server";
import {
  DINE_IN_UNAVAILABLE_CODE,
  assertStoreOpenOr403,
  dineInOrderingEnabled,
  getStoreSession,
} from "@/lib/commerce/store-hours";
import { CART_B64_KEY, CART_CODEC_KEY } from "@ricos/shared";
import { validateCustomerContact } from "@/lib/commerce/customer-contact";
import { getLatestMenuRuntime } from "@/lib/commerce/menu-runtime";
import { MENU_VERSION_CONFLICT_CODE } from "@/lib/commerce/menu-version-policy";
import type { NormalizedIngressEvent } from "@/lib/commerce/domain";
import {
  ORDER_SERVICE_MODE_DINE_IN,
  validateOrderServiceMode,
} from "@/lib/commerce/order-service-mode";
import { executeSolanaIngressEvent } from "@/lib/commerce/web-api/kitchen-order-dispatch/use-cases/execute-ingress-event";
import { buildKitchenOrderPayload } from "@/lib/commerce/web-api/kitchen-order-dispatch/use-cases/process-ingress-event";
import {
  getPurchaseOrdersByReferences,
  insertPendingPurchaseOrderIfNew,
  markPurchaseOrderExpired,
  type PurchaseOrderRecord,
} from "@/lib/infrastructure/turso/webhook-db";
import { getWebhookDb } from "@/lib/infrastructure/turso/webhook-db-runtime";
import { getHeliusIngressConfig, isHeliusWebhookDebugEnabled } from "../../config";
import { parseHeliusIngressPayload } from "../ingress/parse-helius-ingress-payload";

const PENDING_TTL_SECONDS = 120; // Solana blockhash expiry + padding

const HELIUS_INGRESS_EVENT_PREFIX = "evt_helius_";

function heliusTransactionSignatureFromIngressEvent(event: NormalizedIngressEvent): string | null {
  if (event.provider !== "helius") return null;
  const id = event.paymentIngressEventId;
  if (!id.startsWith(HELIUS_INGRESS_EVENT_PREFIX)) return null;
  const sig = id.slice(HELIUS_INGRESS_EVENT_PREFIX.length);
  return sig.length > 0 ? sig : null;
}

type HeliusPendingResolution =
  | { ok: true; orderReference: string; duplicateWebhook: boolean }
  | {
      ok: false;
      code:
        | "solana_pay_reference_unknown"
        | "solana_pay_pending_expired"
        | "solana_pay_duplicate_payment";
      detail: string;
    };

function logHeliusSolanaPayPaymentRejected(params: {
  code:
    | "solana_pay_reference_unknown"
    | "solana_pay_pending_expired"
    | "solana_pay_duplicate_payment";
  orderReference: string;
  transactionSignature: string;
  detail: string;
}): void {
  console.error(
    JSON.stringify({
      scope: "helius_solana_pay_payment_rejected",
      ...params,
    }),
  );
}

function logHeliusSolanaPayDuplicatePayment(params: {
  orderReference: string;
  originalPaymentIngressEventId: string | null;
  duplicatePaymentIngressEventId: string;
  duplicateTransactionSignature: string;
  amountCents: number;
  currency: string;
}): void {
  console.error(
    JSON.stringify({
      scope: "helius_solana_pay_duplicate_payment",
      severity: "error",
      detail: "same_order_reference_paid_by_different_transaction",
      ...params,
    }),
  );
}

function pendingOrderMatchesHeliusEventPayment(order: PurchaseOrderRecord, event: NormalizedIngressEvent): boolean {
  return (
    Math.floor(order.amountCents) === Math.floor(event.amountCents) &&
    order.currency.trim().toLowerCase() === event.currency.trim().toLowerCase()
  );
}

async function resolveHeliusSolanaPayPending(
  db: Client,
  event: NormalizedIngressEvent,
  transactionSignature: string,
): Promise<HeliusPendingResolution> {
  const orderReference = event.paymentReferenceId.trim();

  if (!orderReference) {
    return { ok: false, code: "solana_pay_reference_unknown", detail: "missing_order_reference" };
  }
  if (!transactionSignature) {
    return { ok: false, code: "solana_pay_reference_unknown", detail: "missing_transaction_signature" };
  }

  const rows = await getPurchaseOrdersByReferences(db, [orderReference]);
  const row = rows.get(orderReference);
  if (!row) {
    return { ok: false, code: "solana_pay_reference_unknown", detail: "no_pending_order_row" };
  }

  const now = Date.now();

  if (row.status === "paid") {
    if (row.paymentIngressEventId === event.paymentIngressEventId) {
      return { ok: true, orderReference: row.orderReference, duplicateWebhook: true };
    }
    logHeliusSolanaPayDuplicatePayment({
      orderReference: row.orderReference,
      originalPaymentIngressEventId: row.paymentIngressEventId,
      duplicatePaymentIngressEventId: event.paymentIngressEventId,
      duplicateTransactionSignature: transactionSignature,
      amountCents: event.amountCents,
      currency: event.currency,
    });
    return {
      ok: false,
      code: "solana_pay_duplicate_payment",
      detail: "reference_already_paid_different_tx",
    };
  }

  if (
    row.status === "pending" &&
    (row.paymentIntentExpiresAt === null || row.paymentIntentExpiresAt >= now) &&
    pendingOrderMatchesHeliusEventPayment(row, event)
  ) {
    return { ok: true, orderReference: row.orderReference, duplicateWebhook: false };
  }

  if (row.status === "pending" && row.paymentIntentExpiresAt !== null && row.paymentIntentExpiresAt < now) {
    await markPurchaseOrderExpired(db, row.orderReference);
  }

  return { ok: false, code: "solana_pay_pending_expired", detail: "no_matching_active_pending" };
}

type ReferenceRegistrationRequest = {
  metadata?: Record<string, unknown>;
  amountCents?: unknown;
  currency?: unknown;
  menuVersionSeen?: unknown;
  customerName?: unknown;
  customerPhone?: unknown;
  customerEmail?: unknown;
  serviceMode?: unknown;
};

export async function handleHeliusWebhookRequest(headers: Record<string, string | string[] | undefined>, body: unknown): Promise<Response> {
  const heliusDebug = isHeliusWebhookDebugEnabled();

  const startedAt = Date.now();
  let db;
  const heliusConfig = getHeliusIngressConfig();
  try {
    db = await getWebhookDb();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Helius webhook misconfiguration:", message);
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }

  console.log("Parsing Helius ingress payload...");
  const parsed = parseHeliusIngressPayload({
    body,
    headers,
    config: heliusConfig,
  });

  if (parsed.kind === "error") {
    console.error("Helius ingress rejected:", parsed.message);
    return NextResponse.json({ error: parsed.message }, { status: parsed.status });
  }

  if (heliusDebug || parsed.ignoredCount > 0) {
    console.info("Helius ingress parsed:", {
      processed: parsed.events.length,
      ignored: parsed.ignoredCount,
      ignoredDetails: parsed.ignoredDetails.slice(0, 5),
    });
  }

  for (const event of parsed.events) {
    const transactionSignature = heliusTransactionSignatureFromIngressEvent(event) ?? "";

    if (heliusDebug) {
      console.info("Helius ingress normalized event:", {
        paymentIngressEventId: event.paymentIngressEventId,
        orderReference: event.paymentReferenceId,
        transactionSignature,
        amountCents: event.amountCents,
        currency: event.currency,
      });
    }

    const resolved = await resolveHeliusSolanaPayPending(db, event, transactionSignature);
    if (!resolved.ok) {
      logHeliusSolanaPayPaymentRejected({
        code: resolved.code,
        orderReference: event.paymentReferenceId,
        transactionSignature,
        detail: resolved.detail,
      });
      continue;
    }

    if (resolved.duplicateWebhook) {
      if (heliusDebug) {
        console.info("Helius ingress duplicate webhook (purchase order already paid):", {
          orderReference: resolved.orderReference,
          transactionSignature,
        });
      }
      continue;
    }

    console.log("Executing ingress event:", event);
    const outcome = await executeSolanaIngressEvent(db, event, {
      orderReference: resolved.orderReference,
      transactionSignature,
    });
    if (!outcome.ok) {
      console.error("Helius ingress processing failed:", {
        paymentIngressEventId: event.paymentIngressEventId,
        status: outcome.status,
        body: outcome.body,
      });
      return NextResponse.json(outcome.body, { status: outcome.status });
    }
  }

  if (heliusDebug) {
    console.info("Helius ingress request completed:", {
      processed: parsed.events.length,
      ignored: parsed.ignoredCount,
      elapsedMs: Date.now() - startedAt,
    });
  }

  return NextResponse.json({
    received: true,
    processed: parsed.events.length,
    ignored: parsed.ignoredCount,
  });
}

export async function handleSolanaReferenceRegistrationRequest(req: Request): Promise<Response> {
  try {
    const closed = assertStoreOpenOr403();
    if (closed) return closed;

    const body = (await req.json().catch(() => ({}))) as ReferenceRegistrationRequest;
    const metadata = body.metadata;
    const amountCents = body.amountCents;
    const currency = body.currency;
    const menuVersionSeen = body.menuVersionSeen;
    const contactCheck = validateCustomerContact({
      customerName: body.customerName,
      customerPhone: body.customerPhone,
      customerEmail: body.customerEmail,
    });
    if (!contactCheck.ok) {
      return NextResponse.json({ error: contactCheck.error }, { status: 400 });
    }
    const contact = contactCheck.value;
    const serviceModeCheck = validateOrderServiceMode(body.serviceMode);
    if (!serviceModeCheck.ok) {
      return NextResponse.json({ error: serviceModeCheck.error }, { status: 400 });
    }
    const serviceMode = serviceModeCheck.value;
    if (
      serviceMode === ORDER_SERVICE_MODE_DINE_IN &&
      !dineInOrderingEnabled(getStoreSession(new Date()))
    ) {
      return NextResponse.json(
        { error: "Dine-in is unavailable during last call.", code: DINE_IN_UNAVAILABLE_CODE },
        { status: 403 },
      );
    }
    if (typeof menuVersionSeen !== "number" || !Number.isInteger(menuVersionSeen)) {
      return NextResponse.json({ error: "menuVersionSeen is required" }, { status: 400 });
    }
    if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
      return NextResponse.json({ error: "Missing metadata" }, { status: 400 });
    }
    const cartCodec = metadata[CART_CODEC_KEY];
    const cartB64 = metadata[CART_B64_KEY];
    if (typeof cartCodec !== "string" || typeof cartB64 !== "string") {
      return NextResponse.json({ error: "Invalid cart metadata" }, { status: 400 });
    }
    if (typeof amountCents !== "number" || !Number.isFinite(amountCents) || amountCents <= 0) {
      return NextResponse.json({ error: "Invalid amountCents" }, { status: 400 });
    }
    if (typeof currency !== "string" || !currency.trim()) {
      return NextResponse.json({ error: "Invalid currency" }, { status: 400 });
    }

    const active = await getLatestMenuRuntime();
    if (menuVersionSeen !== active.version) {
      return NextResponse.json(
        {
          error: "Menu was updated. Refresh the menu and rebuild your cart.",
          code: MENU_VERSION_CONFLICT_CODE,
        },
        { status: 409 },
      );
    }

    const signer = await generateKeyPairSigner();
    const orderReference = signer.address;
    const expiresAt = Date.now() + PENDING_TTL_SECONDS * 1000;
    const db = await getWebhookDb();
    const normalizedMetadata = {
      [CART_CODEC_KEY]: cartCodec,
      [CART_B64_KEY]: cartB64,
    };
    const pendingPayload = await buildKitchenOrderPayload(
      db,
      {
        provider: "helius",
        paymentIngressEventId: "",
        paymentReferenceId: orderReference,
        amountCents: Math.floor(amountCents),
        currency: currency.trim().toLowerCase(),
        metadata: normalizedMetadata,
      },
      serviceMode,
    );
    await insertPendingPurchaseOrderIfNew(db, {
      orderReference,
      paymentProvider: "helius",
      paymentIntentExpiresAt: expiresAt,
      amountCents: Math.floor(amountCents),
      currency: currency.trim().toLowerCase(),
      payload: pendingPayload,
      metadata: normalizedMetadata,
      customerName: contact.customerName,
      customerPhone: contact.customerPhone,
      customerEmail: contact.customerEmail,
    });
    return NextResponse.json({ reference: orderReference });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Failed to generate Solana reference address:", err);
    return NextResponse.json(
      { error: "Failed to generate reference address", detail: message },
      { status: 500 },
    );
  }
}
