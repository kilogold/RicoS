import { generateKeyPairSigner } from "@solana/signers";
import { NextResponse } from "next/server";
import { CART_B64_KEY, CART_CODEC_KEY } from "@ricos/shared";
import { executeIngressEvent } from "@/lib/commerce/web-api/kitchen-order-dispatch/use-cases/execute-ingress-event";
import {
  getSolanaPaymentPollerStatus,
  wakeSolanaPaymentPoller,
} from "@/lib/commerce/web-api/solana-payment/use-cases/poller-runtime";
import { insertPendingPaymentIfNew } from "@/lib/infrastructure/turso/webhook-db";
import { getWebhookDb } from "@/lib/infrastructure/turso/webhook-db-runtime";
import {
  getHeliusIngressConfig,
  isHeliusWebhookDebugEnabled,
  isHeliusWebhookEnabled,
} from "../../config";
import { parseHeliusIngressPayload } from "../ingress/parse-helius-ingress-payload";

const PENDING_TTL_SECONDS = 120; // Solana blockhash expiry + padding

type ReferenceRegistrationRequest = {
  metadata?: Record<string, unknown>;
  amountCents?: unknown;
  currency?: unknown;
};

export async function handleHeliusWebhookRequest(headers: Record<string, string | string[] | undefined>, body: unknown): Promise<Response> {
  const heliusDebug = isHeliusWebhookDebugEnabled();

  const startedAt = Date.now();
  let db;
  let heliusConfig = getHeliusIngressConfig();
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
    if (heliusDebug) {
      console.info("Helius ingress normalized event:", {
        ingressEventId: event.ingressEventId,
        paymentReferenceId: event.paymentReferenceId,
        amountCents: event.amountCents,
        currency: event.currency,
      });
    }

    console.log("Executing ingress event:", event);
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
    const issuedAt = Date.now();
    const expiresAt = issuedAt + PENDING_TTL_SECONDS * 1000;
    const db = await getWebhookDb();
    const inserted = await insertPendingPaymentIfNew(db, {
      reference,
      metadataJson: JSON.stringify({
        metadata,
        amountCents: Math.floor(amountCents),
        currency: currency.trim().toLowerCase(),
      }),
      issuedAt,
      expiresAt,
      status: "pending",
    });
    if (inserted) {
      wakeSolanaPaymentPoller();
    }

    return NextResponse.json({ reference });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Failed to generate Solana reference address:", err);
    return NextResponse.json(
      { error: "Failed to generate reference address", detail: message },
      { status: 500 },
    );
  }
}

export async function handleSolanaPollerPokeRequest(): Promise<Response> {
  const before = getSolanaPaymentPollerStatus();
  wakeSolanaPaymentPoller();
  const after = getSolanaPaymentPollerStatus();

  return NextResponse.json({
    ok: true,
    before,
    after,
  });
}

export async function handleSolanaPollerStatusRequest(): Promise<Response> {
  return NextResponse.json({
    ok: true,
    status: getSolanaPaymentPollerStatus(),
  });
}
