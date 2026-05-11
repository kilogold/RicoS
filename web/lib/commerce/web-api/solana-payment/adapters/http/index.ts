import type { Client } from "@libsql/client";
import { generateKeyPairSigner } from "@solana/signers";
import { NextResponse } from "next/server";
import { assertStoreOpenOr403 } from "@/lib/commerce/store-hours";
import { CART_B64_KEY, CART_CODEC_KEY } from "@ricos/shared";
import { validateCustomerContact } from "@/lib/commerce/customer-contact";
import { getLatestMenuRuntime } from "@/lib/commerce/menu-runtime";
import { MENU_VERSION_CONFLICT_CODE } from "@/lib/commerce/menu-version-policy";
import type { NormalizedIngressEvent } from "@/lib/commerce/domain";
import { executeSolanaIngressEvent } from "@/lib/commerce/web-api/kitchen-order-dispatch/use-cases/execute-ingress-event";
import {
  getPendingPaymentsByReferences,
  insertPendingPaymentIfNew,
  upsertOrderContact,
  type PendingPaymentRecord,
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

type PendingPaymentMetadataShape = {
  amountCents?: unknown;
  currency?: unknown;
};

type HeliusPendingResolution =
  | { ok: true; orderReference: string; duplicateWebhook: boolean }
  | {
      ok: false;
      code: "solana_pay_reference_unknown" | "solana_pay_pending_expired";
      detail: string;
    };

function logHeliusSolanaPayPaymentRejected(params: {
  code: "solana_pay_reference_unknown" | "solana_pay_pending_expired";
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

function pendingRecordMatchesHeliusEvent(record: PendingPaymentRecord, event: NormalizedIngressEvent): boolean {
  let meta: PendingPaymentMetadataShape;
  try {
    meta = JSON.parse(record.metadataJson) as PendingPaymentMetadataShape;
  } catch {
    return false;
  }
  if (typeof meta.amountCents !== "number" || !Number.isFinite(meta.amountCents)) return false;
  if (typeof meta.currency !== "string" || !meta.currency.trim()) return false;
  return (
    Math.floor(meta.amountCents) === Math.floor(event.amountCents) &&
    meta.currency.trim().toLowerCase() === event.currency.trim().toLowerCase()
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

  const rows = await getPendingPaymentsByReferences(db, [orderReference]);
  const row = rows.get(orderReference);
  if (!row) {
    return { ok: false, code: "solana_pay_reference_unknown", detail: "no_pending_payment_row" };
  }

  const now = Date.now();

  if (row.status === "confirmed") {
    if (row.signature === transactionSignature) {
      return { ok: true, orderReference: row.orderReference, duplicateWebhook: true };
    }
    return {
      ok: false,
      code: "solana_pay_pending_expired",
      detail: "reference_already_confirmed_different_tx",
    };
  }

  if (
    row.status === "pending" &&
    row.expiresAt >= now &&
    pendingRecordMatchesHeliusEvent(row, event)
  ) {
    return { ok: true, orderReference: row.orderReference, duplicateWebhook: false };
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
        console.info("Helius ingress duplicate webhook (pending_payment already confirmed):", {
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
    if (typeof menuVersionSeen !== "number" || !Number.isInteger(menuVersionSeen)) {
      return NextResponse.json({ error: "menuVersionSeen is required" }, { status: 400 });
    }
    if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
      return NextResponse.json({ error: "Missing metadata" }, { status: 400 });
    }
    if (typeof metadata[CART_CODEC_KEY] !== "string" || typeof metadata[CART_B64_KEY] !== "string") {
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
    const issuedAt = Date.now();
    const expiresAt = issuedAt + PENDING_TTL_SECONDS * 1000;
    const db = await getWebhookDb();
    await insertPendingPaymentIfNew(db, {
      orderReference,
      metadataJson: JSON.stringify({
        metadata,
        amountCents: Math.floor(amountCents),
        currency: currency.trim().toLowerCase(),
      }),
      issuedAt,
      expiresAt,
      status: "pending",
    });
    await upsertOrderContact(db, {
      orderReference,
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
