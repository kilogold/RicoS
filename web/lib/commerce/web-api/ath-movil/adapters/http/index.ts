import { NextResponse } from "next/server";
import { CART_B64_KEY, CART_CODEC_KEY } from "@ricos/shared";
import {
  DINE_IN_UNAVAILABLE_CODE,
  assertStoreOpenOr403,
  dineInOrderingEnabled,
  getStoreSession,
} from "@/lib/commerce/domain/store-hours";
import { validateCustomerContact } from "@/lib/commerce/domain/customer-contact";
import { generateAthMovilPaymentReference } from "@/lib/commerce/domain/payment-reference";
import { getLatestMenuRuntime } from "@/lib/commerce/web-api/staff-order-management/lib/menu-runtime";
import { MENU_VERSION_CONFLICT_CODE } from "@/lib/commerce/web-api/staff-order-management/lib/menu-version-policy";
import {
  ORDER_SERVICE_MODE_DINE_IN,
  validateOrderServiceMode,
} from "@/lib/commerce/web-api/staff-order-management/lib/order-service-mode";
import { buildKitchenOrderPayload } from "@/lib/commerce/web-api/kitchen-order-dispatch/use-cases/process-ingress-event";
import {
  getPurchaseOrderByReference,
  insertPendingPurchaseOrderIfNew,
} from "@/lib/infrastructure/turso/webhook-db";
import { getWebhookDb } from "@/lib/infrastructure/turso/webhook-db-runtime";

type AthReferenceRegistrationRequest = {
  metadata?: Record<string, unknown>;
  grandTotalCents?: unknown;
  currency?: unknown;
  menuVersionSeen?: unknown;
  customerName?: unknown;
  customerPhone?: unknown;
  customerEmail?: unknown;
  serviceMode?: unknown;
};

const ATH_MIN_GRAND_TOTAL_CENTS = 100;
const ATH_MAX_GRAND_TOTAL_CENTS = 150000;

function tursoHost(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("libsql://")) return trimmed.slice("libsql://".length);
  if (trimmed.startsWith("https://")) return trimmed.slice("https://".length);
  return "unknown";
}

export async function handleAthMovilReferenceRegistrationRequest(
  req: Request,
): Promise<Response> {
  try {
    const closed = assertStoreOpenOr403();
    if (closed) return closed;

    const body = (await req.json().catch(() => ({}))) as AthReferenceRegistrationRequest;
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
      !Number.isInteger(grandTotalCents) ||
      grandTotalCents < ATH_MIN_GRAND_TOTAL_CENTS ||
      grandTotalCents > ATH_MAX_GRAND_TOTAL_CENTS
    ) {
      return NextResponse.json(
        {
          error: "Invalid grandTotalCents",
          detail: "ATH Móvil total must be between $1.00 and $1500.00.",
        },
        { status: 400 },
      );
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

    const db = await getWebhookDb();
    const normalizedMetadata = {
      [CART_CODEC_KEY]: cartCodec,
      [CART_B64_KEY]: cartB64,
    };
    const normalizedCurrency = currency.trim().toLowerCase();
    let orderReference = "";
    let inserted = false;
    let persisted = null as Awaited<ReturnType<typeof getPurchaseOrderByReference>>;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      orderReference = generateAthMovilPaymentReference();
      const pendingPayload = await buildKitchenOrderPayload(
        {
          provider: "athmovil",
          paymentIngressEventId: "",
          paymentReferenceId: orderReference,
          grandTotalCents,
          currency: normalizedCurrency,
          metadata: normalizedMetadata,
        },
        serviceMode,
        contact.customerName,
      );

      inserted = await insertPendingPurchaseOrderIfNew(db, {
        orderReference,
        paymentProvider: "athmovil",
        paymentIntentExpiresAt: null,
        grandTotalCents,
        currency: normalizedCurrency,
        payload: pendingPayload,
        metadata: normalizedMetadata,
        customerName: contact.customerName,
        customerPhone: contact.customerPhone,
        customerEmail: contact.customerEmail,
      });
      persisted = await getPurchaseOrderByReference(db, orderReference);
      // Turso can report rowsAffected=0 even when the row exists remotely.
      if (inserted || persisted) {
        inserted = true;
        break;
      }
    }

    if (!inserted) {
      console.error(
        JSON.stringify({
          scope: "ath_reference_insert_conflict",
          grandTotalCents,
          currency: normalizedCurrency,
          tursoHost: tursoHost(process.env.TURSO_DATABASE_URL ?? ""),
        }),
      );
      throw new Error("ath_reference_conflict");
    }

    if (!persisted) {
      console.error(
        JSON.stringify({
          scope: "ath_reference_not_persisted",
          orderReference,
          grandTotalCents,
          currency: normalizedCurrency,
          tursoHost: tursoHost(process.env.TURSO_DATABASE_URL ?? ""),
        }),
      );
      throw new Error("ath_pending_order_not_persisted");
    }

    console.info(
      JSON.stringify({
        scope: "ath_reference_created",
        orderReference,
        grandTotalCents,
        currency: normalizedCurrency,
        tursoHost: tursoHost(process.env.TURSO_DATABASE_URL ?? ""),
      }),
    );

    return NextResponse.json({ reference: orderReference });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Failed to generate ATH Móvil reference:", err);
    return NextResponse.json(
      { error: "Failed to generate ATH Móvil reference", detail: message },
      { status: 500 },
    );
  }
}
