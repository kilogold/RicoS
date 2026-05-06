import { generateKeyPairSigner } from "@solana/signers";
import { CART_B64_KEY, CART_CODEC_KEY } from "@ricos/shared";
import type { Client } from "@libsql/client";
import { insertPendingPaymentIfNew } from "@/lib/infrastructure/turso/commerce-db";

const DEFAULT_PENDING_TTL_SECONDS = 15 * 60;
const MAX_PENDING_TTL_SECONDS = 30 * 60;

export type ReferenceRegistrationRequest = {
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

export function validateReferenceRequest(body: ReferenceRegistrationRequest): {
  ok: true;
  metadata: Record<string, unknown>;
  amountCents: number;
  currency: string;
  ttlSeconds: number;
} | { ok: false; status: number; error: string } {
  const metadata = body.metadata;
  const amountCents = body.amountCents;
  const currency = body.currency;
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    return { ok: false, status: 400, error: "Missing metadata" };
  }
  if (typeof metadata[CART_CODEC_KEY] !== "string" || typeof metadata[CART_B64_KEY] !== "string") {
    return { ok: false, status: 400, error: "Invalid cart metadata" };
  }
  if (typeof amountCents !== "number" || !Number.isFinite(amountCents) || amountCents <= 0) {
    return { ok: false, status: 400, error: "Invalid amountCents" };
  }
  if (typeof currency !== "string" || !currency.trim()) {
    return { ok: false, status: 400, error: "Invalid currency" };
  }

  return {
    ok: true,
    metadata,
    amountCents,
    currency: currency.trim().toLowerCase(),
    ttlSeconds: parseTtlSeconds(body.ttlSeconds),
  };
}

export async function registerSolanaReference(
  db: Client,
  payload: {
    metadata: Record<string, unknown>;
    amountCents: number;
    currency: string;
    ttlSeconds: number;
  },
): Promise<{ reference: string }> {
  const signer = await generateKeyPairSigner();
  const reference = signer.address;
  const nowMs = Date.now();
  await insertPendingPaymentIfNew(db, {
    reference,
    metadataJson: JSON.stringify({
      metadata: payload.metadata,
      amountCents: Math.floor(payload.amountCents),
      currency: payload.currency,
    }),
    expiresAt: nowMs + payload.ttlSeconds * 1000,
    status: "pending",
  });

  return { reference };
}
