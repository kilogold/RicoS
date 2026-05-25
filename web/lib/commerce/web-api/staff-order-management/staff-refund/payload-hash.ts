import { createHash } from "node:crypto";

export type RefundPayloadForHash = {
  orderReference: string;
  amountCents: number;
  solanaRefundTransactionSignature?: string;
  idempotencyKey?: string;
};

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Canonical refund fields for challenge binding (sorted keys, trimmed strings). */
export function canonicalRefundPayload(
  payload: RefundPayloadForHash,
): Record<string, string | number> {
  const out: Record<string, string | number> = {
    amountCents: payload.amountCents,
    orderReference: payload.orderReference.trim(),
  };
  const solana = normalizeOptionalString(payload.solanaRefundTransactionSignature);
  if (solana) out.solanaRefundTransactionSignature = solana;
  const idempotency = normalizeOptionalString(payload.idempotencyKey);
  if (idempotency) out.idempotencyKey = idempotency;
  return out;
}

export function hashRefundPayload(payload: RefundPayloadForHash): string {
  const canonical = canonicalRefundPayload(payload);
  const sortedKeys = Object.keys(canonical).sort();
  const sorted: Record<string, string | number> = {};
  for (const key of sortedKeys) {
    sorted[key] = canonical[key];
  }
  const json = JSON.stringify(sorted);
  return createHash("sha256").update(json, "utf8").digest("hex");
}
