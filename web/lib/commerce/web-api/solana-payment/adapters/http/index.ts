import { generateKeyPairSigner } from "@solana/kit";
import { NextResponse } from "next/server";
import {
  DINE_IN_UNAVAILABLE_CODE,
  assertStoreOpenOr403,
  dineInOrderingEnabled,
  getStoreSession,
} from "@/lib/commerce/domain/store-hours";
import { CART_B64_KEY, CART_CODEC_KEY } from "@ricos/shared";
import { validateCustomerContact } from "@/lib/commerce/domain/customer-contact";
import {
  getHeliusIngressConfig,
  isHeliusWebhookDebugEnabled,
} from "@/lib/commerce/web-api/solana-payment/config";
import { parseHeliusIngressPayload } from "@/lib/commerce/web-api/solana-payment/adapters/ingress/parse-helius-ingress-payload";
import {
  heliusPaymentToNormalizedEvent,
  resolveHeliusSolanaPayPending,
} from "@/lib/commerce/web-api/solana-payment/adapters/http/resolve-helius-solana-pay-pending";
import { buildKitchenOrderPayload } from "@/lib/commerce/web-api/kitchen-order-dispatch/use-cases/process-ingress-event";
import { executeSolanaIngressEvent } from "@/lib/commerce/web-api/kitchen-order-dispatch/use-cases/execute-ingress-event";
import { getLatestMenuRuntime } from "@/lib/commerce/web-api/staff-order-management/lib/menu-runtime";
import { MENU_VERSION_CONFLICT_CODE } from "@/lib/commerce/web-api/staff-order-management/lib/menu-version-policy";
import {
  ORDER_SERVICE_MODE_DINE_IN,
  validateOrderServiceMode,
} from "@/lib/commerce/web-api/staff-order-management/lib/order-service-mode";
import { insertPendingPurchaseOrderIfNew } from "@/lib/infrastructure/turso/webhook-db";
import { getWebhookDb } from "@/lib/infrastructure/turso/webhook-db-runtime";

export { handleSolanaRpcProxyRequest } from "@/lib/infrastructure/helius/solana-rpc-proxy";

const HELIUS_INGRESS_EVENT_PREFIX = "evt_helius_";

function heliusTransactionSignatureFromPaymentIngressEventId(id: string): string | null {
  if (!id.startsWith(HELIUS_INGRESS_EVENT_PREFIX)) return null;
  const sig = id.slice(HELIUS_INGRESS_EVENT_PREFIX.length);
  return sig.length > 0 ? sig : null;
}

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

type ReferenceRegistrationRequest = {
  metadata?: Record<string, unknown>;
  grandTotalCents?: unknown;
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

  for (const payment of parsed.events) {
    const transactionSignature =
      heliusTransactionSignatureFromPaymentIngressEventId(payment.paymentIngressEventId) ?? "";

    if (heliusDebug) {
      console.info("Helius ingress parsed payment:", {
        paymentIngressEventId: payment.paymentIngressEventId,
        orderReferenceCandidates: payment.orderReferenceCandidates,
        transactionSignature,
        grandTotalCents: payment.grandTotalCents,
        currency: payment.currency,
      });
    }

    const resolved = await resolveHeliusSolanaPayPending(db, payment, transactionSignature);
    if (!resolved.ok) {
      logHeliusSolanaPayPaymentRejected({
        code: resolved.code,
        orderReference: resolved.orderReference,
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

    const event = heliusPaymentToNormalizedEvent(payment, resolved.orderReference);
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
    const grandTotalCents = body.grandTotalCents;
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
    if (
      typeof grandTotalCents !== "number" ||
      !Number.isFinite(grandTotalCents) ||
      grandTotalCents <= 0
    ) {
      return NextResponse.json({ error: "Invalid grandTotalCents" }, { status: 400 });
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
    const db = await getWebhookDb();
    const normalizedMetadata = {
      [CART_CODEC_KEY]: cartCodec,
      [CART_B64_KEY]: cartB64,
    };
    const pendingPayload = await buildKitchenOrderPayload(
      {
        provider: "helius",
        paymentIngressEventId: "",
        paymentReferenceId: orderReference,
        grandTotalCents: Math.floor(grandTotalCents),
        currency: currency.trim().toLowerCase(),
        metadata: normalizedMetadata,
      },
      serviceMode,
      contact.customerName,
    );
    await insertPendingPurchaseOrderIfNew(db, {
      orderReference,
      paymentProvider: "helius",
      paymentIntentExpiresAt: null,
      grandTotalCents: Math.floor(grandTotalCents),
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
