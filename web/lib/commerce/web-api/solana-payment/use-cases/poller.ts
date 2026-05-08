/**
 * Solana payment business poller.
 *
 * Business responsibility:
 * - Read active pending payment references from DB.
 * - Verify on-chain settlement and transfer correctness.
 * - Convert confirmed settlements into normalized ingress events.
 * - Publish paid-order facts through existing ingress/order dispatch flow.
 * - Mark references as confirmed or expired based on processing outcome.
 *
 * Separation of concerns:
 * - This file owns domain/business decisions and payment-processing workflow.
 * - Runtime lifecycle concerns (singleton state, wake/sleep signaling, loop timing)
 *   are delegated to `poller-runtime.ts`.
 */
import type { Client } from "@libsql/client";
import { address } from "@solana/kit";
import type { NormalizedIngressEvent } from "@/lib/commerce/domain";
import { executeIngressEvent } from "@/lib/commerce/web-api/kitchen-order-dispatch/use-cases/execute-ingress-event";
import { getSolanaRpcClient, rpcCall } from "@/lib/infrastructure/helius/solana-rpc";
import {
  expireStalePendingPayments,
  listActivePendingPayments,
  markPendingPaymentConfirmed,
  markPendingPaymentExpired,
} from "@/lib/infrastructure/turso/webhook-db";
import { POLL_INTERVAL_MS, pollerState, sleep, waitForWakeSignal } from "./poller-runtime";
import { getWebhookDb } from "@/lib/infrastructure/turso/webhook-db-runtime";

type PendingMetadata = {
  metadata: Record<string, string | undefined>;
  amountCents: number;
  currency: string;
};

async function getLatestSignatureForReference(reference: string): Promise<string | undefined> {
  const result = await getSolanaRpcClient()
    .getSignaturesForAddress(address(reference), {
      commitment: "confirmed",
      limit: 1,
    })
    .send();
  const signature = result[0]?.signature;
  return signature ? String(signature) : undefined;
}

type ParsedInstruction = {
  program?: string;
  parsed?: { type?: string; info?: Record<string, unknown> };
};

type AccountKey = string | { pubkey?: string };

type TokenBalance = {
  accountIndex?: number;
  mint?: string;
  owner?: string;
};

type RpcTransaction = {
  transaction?: {
    message?: {
      accountKeys?: AccountKey[];
      instructions?: ParsedInstruction[];
    };
  };
  meta?: {
    innerInstructions?: { instructions?: ParsedInstruction[] }[];
    postTokenBalances?: TokenBalance[];
    preTokenBalances?: TokenBalance[];
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

function accountKeyAt(tx: RpcTransaction, index: number): string | undefined {
  const accountKey = tx.transaction?.message?.accountKeys?.[index];
  if (typeof accountKey === "string") return accountKey;
  if (accountKey && typeof accountKey === "object" && typeof accountKey.pubkey === "string") {
    return accountKey.pubkey;
  }
  return undefined;
}

function destinationOwnerForMint(
  tx: RpcTransaction,
  tokenAccount: string,
  mintExpected: string,
): string | undefined {
  const balances = [...(tx.meta?.postTokenBalances ?? []), ...(tx.meta?.preTokenBalances ?? [])];
  const tokenAccountNormalized = normalize(tokenAccount);
  for (const balance of balances) {
    if (typeof balance.accountIndex !== "number") continue;
    const pubkey = accountKeyAt(tx, balance.accountIndex);
    if (!pubkey || normalize(pubkey) !== tokenAccountNormalized) continue;
    if (normalize(balance.mint) !== mintExpected) continue;
    if (typeof balance.owner === "string" && balance.owner.trim()) {
      return balance.owner;
    }
  }
  return undefined;
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
    const mint = normalize(String((info as Record<string, unknown>).mint ?? ""));
    if (!mint || mint !== mintExpected) continue;

    const recipientOwner = destinationOwnerForMint(
      tx,
      String(
        (info as Record<string, unknown>).destination ??
          (info as Record<string, unknown>).to ??
          (info as Record<string, unknown>).toAccount ??
          (info as Record<string, unknown>).toUserAccount ??
          "",
      ),
      mintExpected,
    );
    const recipientMatches =
      recipient === recipientExpected || normalize(recipientOwner) === recipientExpected;
    if (!recipientMatches) continue;

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
  // Keep running while this process has the poller enabled.
  while (pollerState.started) {
    try {
      const db = await getDb();
      const nowMs = Date.now();
      const expired = await expireStalePendingPayments(db, nowMs);
      if (expired > 0) {
        console.info("Pending payments expired:", expired);
      }
      const pending = await listActivePendingPayments(db, nowMs);
      if (pending.length === 0) {
        // TODO: add a low-frequency heartbeat DB check as a quick fix for multi-instance wake gaps.
        // Nothing left to process, so sleep until a new reference is inserted.
        await waitForWakeSignal();
        continue;
      }
      // Process every currently active pending reference before the next delay.
      for (const row of pending) {
        await processPending(db, row);
      }
    } catch (err) {
      console.error("Solana payment poller iteration failed:", err);
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

export function ensureSolanaPaymentPollerStarted(): void {
    if (pollerState.started) return;
    pollerState.started = true;
    pollerState.loopPromise = runLoop(getWebhookDb);
    pollerState.loopPromise.catch((err) => {
      pollerState.started = false;
      console.error("Solana payment poller terminated:", err);
    });
}
