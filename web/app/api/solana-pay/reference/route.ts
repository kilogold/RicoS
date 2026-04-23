import { generateKeyPairSigner } from "@solana/signers";
import { NextResponse } from "next/server";
import { CART_B64_KEY, CART_CODEC_KEY } from "@ricos/shared";
import { insertPendingPaymentIfNew } from "@/lib/webhook-backend/db";
import { ensureBackendPollerStarted, getWebhookDb } from "@/lib/webhook-backend/runtime";

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

export async function POST(req: Request) {
  try {
    ensureBackendPollerStarted();
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
