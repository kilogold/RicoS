import { generateKeyPairSigner } from "@solana/signers";
import { NextResponse } from "next/server";
import { CART_B64_KEY, CART_CODEC_KEY } from "@ricos/shared";
import { executeIngressEvent } from "@/lib/commerce/web-api/kitchen-order-dispatch/use-cases/execute-ingress-event";
import { insertPendingPaymentIfNew } from "@/lib/infrastructure/turso/webhook-db";
import { getWebhookDb } from "@/lib/infrastructure/turso/webhook-db-runtime";
import {
  getHeliusIngressConfig,
  isHeliusWebhookDebugEnabled,
  isHeliusWebhookEnabled,
} from "../../config";
import { parseHeliusIngressPayload } from "../ingress/parse-helius-ingress-payload";
import { ensureSolanaPaymentBackendPollerStarted } from "../../use-cases/ensure-poller-started";

const DEFAULT_PENDING_TTL_SECONDS = 15 * 60;
const MAX_PENDING_TTL_SECONDS = 30 * 60;

type ReferenceRegistrationRequest = {
  metadata?: Record<string, unknown>;
  amountCents?: unknown;
  currency?: unknown;
  ttlSeconds?: unknown;
};

function parseTtlSeconds(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return DEFAULT_PENDING_TTL_SECONDS;
  const rounded = Math.floor(raw);
  if (rounded <= 0) return DEFAULT_PENDING_TTL_SECONDS;
  return Math.min(rounded, MAX_PENDING_TTL_SECONDS);
}

function headersToRecord(headers: Headers): Record<string, string | string[] | undefined> {
  const record: Record<string, string | undefined> = {};
  for (const [key, value] of headers.entries()) {
    record[key.toLowerCase()] = value;
  }
  return record;
}

export async function handleHeliusWebhookRequest(req: Request): Promise<Response> {
  const heliusDebug = isHeliusWebhookDebugEnabled();
  if (!isHeliusWebhookEnabled()) {
    if (heliusDebug) {
      console.info("Helius webhook received while disabled; ignoring request.");
    }
    return NextResponse.json({ received: true, ignored: true, reason: "webhook_disabled" });
  }

  const startedAt = Date.now();
  let db;
  let heliusConfig;
  try {
    db = await getWebhookDb();
    heliusConfig = getHeliusIngressConfig();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Helius webhook misconfiguration:", message);
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseHeliusIngressPayload({
    body,
    headers: headersToRecord(req.headers),
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
    if (heliusDebug) {
      console.info("Helius ingress normalized event:", {
        ingressEventId: event.ingressEventId,
        paymentReferenceId: event.paymentReferenceId,
        amountCents: event.amountCents,
        currency: event.currency,
      });
    }
    const outcome = await executeIngressEvent(db, event);
    if (!outcome.ok) {
      console.error("Helius ingress processing failed:", {
        ingressEventId: event.ingressEventId,
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
    ensureSolanaPaymentBackendPollerStarted();
    const body = (await req.json().catch(() => ({}))) as ReferenceRegistrationRequest;
    const metadata = body.metadata;
    const amountCents = body.amountCents;
    const currency = body.currency;
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

    const signer = await generateKeyPairSigner();
    const reference = signer.address;
    const ttlSeconds = parseTtlSeconds(body.ttlSeconds);
    const nowMs = Date.now();
    const db = await getWebhookDb();
    await insertPendingPaymentIfNew(db, {
      reference,
      metadataJson: JSON.stringify({
        metadata,
        amountCents: Math.floor(amountCents),
        currency: currency.trim().toLowerCase(),
      }),
      expiresAt: nowMs + ttlSeconds * 1000,
      status: "pending",
    });

    return NextResponse.json({ reference });
  } catch {
    return NextResponse.json(
      { error: "Failed to generate reference address" },
      { status: 500 },
    );
  }
}
