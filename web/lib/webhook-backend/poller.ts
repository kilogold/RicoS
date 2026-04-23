import type { Client } from "@libsql/client";
import {
  expireStalePendingPayments,
  listActivePendingPayments,
  markPendingPaymentConfirmed,
  markPendingPaymentExpired,
} from "./db";
import { executeIngressEvent } from "./ingress/execute";
import type { NormalizedIngressEvent } from "./ingress/types";

type PollerState = {
  started: boolean;
  loopPromise: Promise<void> | null;
};

type PendingMetadata = {
  metadata: Record<string, string | undefined>;
  amountCents: number;
  currency: string;
};

const state = globalThis as typeof globalThis & { __ricosSolanaPoller?: PollerState };
if (!state.__ricosSolanaPoller) {
  state.__ricosSolanaPoller = { started: false, loopPromise: null };
}

const pollerState = state.__ricosSolanaPoller;
const DEFAULT_RPC_URL = "https://api.devnet.solana.com";
const POLL_INTERVAL_MS = parsePositiveInt(process.env.SOLANA_POLL_INTERVAL_MS, 2000);

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function rpcUrl(): string {
  return process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() || DEFAULT_RPC_URL;
}

async function rpcCall<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(rpcUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `ricos-${Date.now()}-${method}`,
      method,
      params,
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`RPC ${method} failed: ${res.status}`);
  }
  const json = (await res.json()) as { result?: T; error?: { message?: string } };
  if (json.error) {
    throw new Error(`RPC ${method} error: ${json.error.message ?? "unknown_error"}`);
  }
  return json.result as T;
}

type SignatureInfo = { signature?: string };

async function getLatestSignatureForReference(reference: string): Promise<string | undefined> {
  const result = await rpcCall<SignatureInfo[]>("getSignaturesForAddress", [reference, { limit: 1 }]);
  return result[0]?.signature;
}

type ParsedInstruction = {
  program?: string;
  parsed?: { type?: string; info?: Record<string, unknown> };
};

type RpcTransaction = {
  transaction?: {
    message?: {
      instructions?: ParsedInstruction[];
    };
  };
  meta?: {
    innerInstructions?: { instructions?: ParsedInstruction[] }[];
  };
};

function decodeAmountCents(info: Record<string, unknown>): number | null {
  const tokenAmount = info.tokenAmount;
  if (tokenAmount && typeof tokenAmount === "object" && !Array.isArray(tokenAmount)) {
    const rawObj = tokenAmount as Record<string, unknown>;
    if (typeof rawObj.uiAmountString === "string" && rawObj.uiAmountString.trim()) {
      const amount = Number(rawObj.uiAmountString);
      if (Number.isFinite(amount) && amount > 0) {
        const cents = Math.round(amount * 100);
        return cents > 0 ? cents : null;
      }
    }
    if (typeof rawObj.amount === "string" && typeof rawObj.decimals === "number") {
      const decimals = rawObj.decimals;
      const amount = rawObj.amount;
      if (Number.isInteger(decimals) && /^\d+$/.test(amount)) {
        const rawUnits = BigInt(amount);
        if (rawUnits <= BigInt(0) || decimals < 2) return null;
        const divisor = BigInt(10) ** BigInt(decimals - 2);
        if (rawUnits % divisor !== BigInt(0)) return null;
        const cents = Number(rawUnits / divisor);
        return Number.isSafeInteger(cents) ? cents : null;
      }
    }
  }

  const uiAmount = info.uiAmount ?? info.amount;
  if (typeof uiAmount === "number" && Number.isFinite(uiAmount) && uiAmount > 0) {
    const cents = Math.round(uiAmount * 100);
    return cents > 0 ? cents : null;
  }
  if (typeof uiAmount === "string" && uiAmount.trim()) {
    const parsed = Number(uiAmount);
    if (Number.isFinite(parsed) && parsed > 0) {
      const cents = Math.round(parsed * 100);
      return cents > 0 ? cents : null;
    }
  }
  return null;
}

function normalize(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function allInstructions(tx: RpcTransaction): ParsedInstruction[] {
  const top = tx.transaction?.message?.instructions ?? [];
  const inner = tx.meta?.innerInstructions?.flatMap((entry) => entry.instructions ?? []) ?? [];
  return [...top, ...inner];
}

async function hasMatchingTransfer(params: {
  signature: string;
  expectedRecipient: string;
  expectedMint: string;
  expectedAmountCents: number;
}): Promise<boolean> {
  const tx = await rpcCall<RpcTransaction | null>("getTransaction", [
    params.signature,
    {
      encoding: "jsonParsed",
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    },
  ]);
  if (!tx) return false;

  const recipientExpected = normalize(params.expectedRecipient);
  const mintExpected = normalize(params.expectedMint);

  for (const instruction of allInstructions(tx)) {
    if (normalize(instruction.program) !== "spl-token") continue;
    const parsed = instruction.parsed;
    const info = parsed?.info;
    if (!parsed || !info || typeof info !== "object" || Array.isArray(info)) continue;

    const recipient = normalize(
      String(
        (info as Record<string, unknown>).destination ??
          (info as Record<string, unknown>).to ??
          (info as Record<string, unknown>).toAccount ??
          (info as Record<string, unknown>).toUserAccount ??
          "",
      ),
    );
    if (recipient !== recipientExpected) continue;

    const mint = normalize(String((info as Record<string, unknown>).mint ?? ""));
    if (!mint || mint !== mintExpected) continue;

    const amountCents = decodeAmountCents(info as Record<string, unknown>);
    if (amountCents === null) continue;
    if (amountCents === params.expectedAmountCents) {
      return true;
    }
  }
  return false;
}

function parsePendingMetadata(rawJson: string): PendingMetadata | null {
  try {
    const parsed = JSON.parse(rawJson) as {
      metadata?: unknown;
      amountCents?: unknown;
      currency?: unknown;
    };
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.amountCents !== "number" || !Number.isFinite(parsed.amountCents)) return null;
    if (typeof parsed.currency !== "string" || !parsed.currency.trim()) return null;
    if (!parsed.metadata || typeof parsed.metadata !== "object" || Array.isArray(parsed.metadata)) {
      return null;
    }

    const metadata = parsed.metadata as Record<string, unknown>;
    const normalized: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(metadata)) {
      normalized[k] = typeof v === "string" ? v : undefined;
    }

    return {
      metadata: normalized,
      amountCents: Math.floor(parsed.amountCents),
      currency: parsed.currency.trim().toLowerCase(),
    };
  } catch {
    return null;
  }
}

async function processPending(db: Client, pending: { reference: string; metadataJson: string }): Promise<void> {
  const pendingMetadata = parsePendingMetadata(pending.metadataJson);
  if (!pendingMetadata) {
    console.error("Pending payment metadata malformed; expiring:", pending.reference);
    await markPendingPaymentExpired(db, pending.reference);
    return;
  }

  const signature = await getLatestSignatureForReference(pending.reference);
  if (!signature) return;

  const expectedRecipient = process.env.HELIUS_MERCHANT_RECIPIENT?.trim();
  const expectedMint = process.env.HELIUS_USDC_MINT?.trim();
  if (!expectedRecipient || !expectedMint) {
    throw new Error("Missing HELIUS_MERCHANT_RECIPIENT or HELIUS_USDC_MINT");
  }

  const transferMatches = await hasMatchingTransfer({
    signature,
    expectedRecipient,
    expectedMint,
    expectedAmountCents: pendingMetadata.amountCents,
  });
  if (!transferMatches) return;

  const event: NormalizedIngressEvent = {
    provider: "helius",
    ingressEventId: `evt_helius_${signature}`,
    paymentReferenceId: signature,
    amountCents: pendingMetadata.amountCents,
    currency: pendingMetadata.currency,
    metadata: pendingMetadata.metadata,
  };
  const outcome = await executeIngressEvent(db, event);
  if (!outcome.ok) {
    console.error("Pending payment enqueue failed:", {
      reference: pending.reference,
      signature,
      status: outcome.status,
      body: outcome.body,
    });
    if (outcome.status >= 400 && outcome.status < 500) {
      await markPendingPaymentExpired(db, pending.reference);
    }
    return;
  }

  await markPendingPaymentConfirmed(db, pending.reference, signature);
  console.info("Pending payment confirmed:", { reference: pending.reference, signature });
}

async function runLoop(getDb: () => Promise<Client>): Promise<void> {
  while (true) {
    try {
      const db = await getDb();
      const nowMs = Date.now();
      const expired = await expireStalePendingPayments(db, nowMs);
      if (expired > 0) {
        console.info("Pending payments expired:", expired);
      }
      const pending = await listActivePendingPayments(db, nowMs);
      for (const row of pending) {
        await processPending(db, row);
      }
    } catch (err) {
      console.error("Solana payment poller iteration failed:", err);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

export function ensureSolanaPaymentPollerStarted(getDb: () => Promise<Client>): void {
  if (pollerState.started) return;
  pollerState.started = true;
  pollerState.loopPromise = runLoop(getDb);
  pollerState.loopPromise.catch((err) => {
    pollerState.started = false;
    console.error("Solana payment poller terminated:", err);
  });
}
