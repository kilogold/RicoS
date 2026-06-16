import type { NormalizedIngressEvent } from "@/lib/commerce/domain";

type UnknownRecord = Record<string, unknown>;

export type NormalizedAthRefundEvent = {
  provider: "athmovil";
  refundIngressEventId: string;
  athReferenceNumber: string;
  refundTotalCents: number;
  currency: "usd";
};

export type AthIngressParseResult =
  | { kind: "error"; status: number; message: string }
  | {
      kind: "ignore";
      reason: string;
      transactionType: string | null;
      status: string | null;
      referenceNumber: string | null;
      ecommerceId: string | null;
    }
  | { kind: "payment"; event: NormalizedIngressEvent }
  | { kind: "refund"; event: NormalizedAthRefundEvent };

export function parseAthIngressEvent(body: unknown): AthIngressParseResult {
  if (!isRecord(body)) {
    return { kind: "error", status: 400, message: "Invalid ATH Móvil payload" };
  }

  const transactionTypeRaw = readString(body, ["transactionType"]);
  const statusRaw = readString(body, ["status"]);
  const referenceNumber = readNonEmptyString(body, ["referenceNumber"]);
  const ecommerceId = readString(body, ["ecommerceId"]);
  const typeNorm = normalizeLower(transactionTypeRaw);
  const statusNorm = normalizeLower(statusRaw);

  if (!typeNorm || !statusNorm) {
    return {
      kind: "error",
      status: 400,
      message: "ATH payload missing transactionType/status",
    };
  }

  if (typeNorm === "ecommerce" && statusNorm === "completed") {
    const paymentReferenceId = readNonEmptyString(body, ["metadata1"]);
    if (!paymentReferenceId) {
      return { kind: "error", status: 400, message: "ATH ecommerce missing metadata1" };
    }
    if (!referenceNumber) {
      return { kind: "error", status: 400, message: "ATH ecommerce missing referenceNumber" };
    }
    const total = readDollarsAsCents(body, ["total"]);
    if (total === null) {
      return { kind: "error", status: 400, message: "ATH ecommerce missing total" };
    }

    return {
      kind: "payment",
      event: {
        provider: "athmovil",
        paymentIngressEventId: `evt_ath_${referenceNumber}`,
        paymentReferenceId,
        grandTotalCents: total,
        currency: "usd",
        metadata: {
          ecommerceId: ecommerceId ?? undefined,
          athReferenceNumber: referenceNumber,
        },
      },
    };
  }

  if (typeNorm === "refund" && statusNorm === "completed") {
    if (!referenceNumber) {
      return { kind: "error", status: 400, message: "ATH refund missing referenceNumber" };
    }
    const total = readDollarsAsCents(body, ["total"]);
    if (total === null) {
      return { kind: "error", status: 400, message: "ATH refund missing total" };
    }
    const dailyTransactionId = readNonEmptyString(body, ["dailyTransactionID", "dailyTransactionId"]);
    return {
      kind: "refund",
      event: {
        provider: "athmovil",
        refundIngressEventId: dailyTransactionId
          ? `evt_ath_refund_${dailyTransactionId}`
          : `evt_ath_refund_${referenceNumber}`,
        athReferenceNumber: referenceNumber,
        refundTotalCents: total,
        currency: "usd",
      },
    };
  }

  return {
    kind: "ignore",
    reason: "unmatched_transaction_type_or_status",
    transactionType: transactionTypeRaw ?? null,
    status: statusRaw ?? null,
    referenceNumber: referenceNumber ?? null,
    ecommerceId: ecommerceId ?? null,
  };
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeLower(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized || undefined;
}

function readString(obj: UnknownRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string") return value;
  }
  return undefined;
}

function readNonEmptyString(obj: UnknownRecord, keys: string[]): string | undefined {
  const value = readString(obj, keys)?.trim();
  return value || undefined;
}

function readDollarsAsCents(obj: UnknownRecord, keys: string[]): number | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "number") {
      if (!Number.isFinite(value) || value <= 0) return null;
      const cents = Math.round(value * 100);
      return cents > 0 ? cents : null;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed <= 0) return null;
      const cents = Math.round(parsed * 100);
      return cents > 0 ? cents : null;
    }
  }
  return null;
}
