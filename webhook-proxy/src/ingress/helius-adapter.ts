import { CART_B64_KEY, CART_CODEC_ID_V1, CART_CODEC_KEY } from "@ricos/shared";
import type { NormalizedIngressEvent } from "./types.js";

type UnknownRecord = Record<string, unknown>;

export type HeliusIngressConfig = {
  authHeaderName: string;
  authHeaderValue?: string;
  expectedUsdcMint: string;
  expectedRecipient: string;
};

export type HeliusIngressParseResult =
  | { kind: "error"; status: number; message: string }
  | { kind: "ok"; events: NormalizedIngressEvent[]; ignoredCount: number };

export function parseHeliusIngressPayload(params: {
  body: unknown;
  headers: Record<string, string | string[] | undefined>;
  config: HeliusIngressConfig;
}): HeliusIngressParseResult {
  const { body, headers, config } = params;
  const authErr = verifyAuth(headers, config);
  if (authErr) return authErr;

  const candidates = normalizeCandidates(body);
  if (candidates.length === 0) {
    return { kind: "error", status: 400, message: "Invalid Helius payload: no events" };
  }

  const normalizedEvents: NormalizedIngressEvent[] = [];
  let ignoredCount = 0;

  for (const candidate of candidates) {
    const maybeEvent = parseCandidate(candidate, config);
    if (maybeEvent.kind === "ignore") {
      ignoredCount += 1;
      continue;
    }
    if (maybeEvent.kind === "error") return maybeEvent;
    normalizedEvents.push(maybeEvent.event);
  }

  return { kind: "ok", events: normalizedEvents, ignoredCount };
}

function verifyAuth(
  headers: Record<string, string | string[] | undefined>,
  config: HeliusIngressConfig,
): { kind: "error"; status: number; message: string } | null {
  const expected = config.authHeaderValue?.trim();
  if (!expected) return null;
  const raw = headers[config.authHeaderName.toLowerCase()];
  const got = Array.isArray(raw) ? raw[0] : raw;
  if (!got || got !== expected) {
    return { kind: "error", status: 401, message: "Unauthorized Helius webhook" };
  }
  return null;
}

function normalizeCandidates(body: unknown): UnknownRecord[] {
  if (Array.isArray(body)) return body.filter(isRecord);
  if (!isRecord(body)) return [];

  const txs = body.transactions;
  if (Array.isArray(txs)) return txs.filter(isRecord);
  return [body];
}

function parseCandidate(
  candidate: UnknownRecord,
  config: HeliusIngressConfig,
):
  | { kind: "error"; status: number; message: string }
  | { kind: "ignore" }
  | { kind: "event"; event: NormalizedIngressEvent } {
  const signature = firstString(candidate, [
    ["signature"],
    ["transactionSignature"],
    ["txSignature"],
  ]);
  if (!signature) {
    return { kind: "error", status: 400, message: "Helius payload missing transaction signature" };
  }

  const memo = extractMemo(candidate);
  const matchingTransfer = findMatchingTransfer(
    candidate,
    config.expectedUsdcMint,
    config.expectedRecipient,
  );

  const hasMemo = Boolean(memo);
  const hasAnyTransfer = listTokenTransfers(candidate).length > 0;

  // Solana Pay minimum pattern for this integration: transfer + memo.
  if (!hasMemo && !hasAnyTransfer) return { kind: "ignore" };

  if (!hasMemo) {
    return { kind: "error", status: 400, message: "Solana Pay candidate missing memo" };
  }
  if (!hasAnyTransfer) {
    return { kind: "error", status: 400, message: "Solana Pay candidate missing token transfer" };
  }
  if (matchingTransfer.kind === "mint_or_recipient_mismatch") {
    return {
      kind: "error",
      status: 400,
      message: "Solana Pay transfer mint or recipient mismatch",
    };
  }
  if (matchingTransfer.kind === "no_amount") {
    return {
      kind: "error",
      status: 400,
      message: "Solana Pay transfer amount missing or invalid",
    };
  }

  return {
    kind: "event",
    event: {
      provider: "helius",
      ingressEventId: `evt_helius_${signature}`,
      paymentReferenceId: signature,
      amountCents: matchingTransfer.amountCents,
      currency: "usdc",
      metadata: {
        [CART_CODEC_KEY]: CART_CODEC_ID_V1,
        [CART_B64_KEY]: memo,
      },
    },
  };
}

function extractMemo(candidate: UnknownRecord): string | undefined {
  const directMemo = firstString(candidate, [
    ["memo"],
    ["events", "memo"],
  ]);
  if (directMemo && directMemo.trim()) return directMemo.trim();

  const logMemo = extractMemoFromLogs(candidate);
  if (logMemo) return logMemo;

  const instructions = firstArray(candidate, [
    ["instructions"],
    ["transaction", "message", "instructions"],
  ]);
  if (!instructions) return undefined;
  for (const value of instructions) {
    if (!isRecord(value)) continue;
    const program = toLower(firstString(value, [["program"], ["programId"], ["type"]]));
    const parsedType = toLower(firstString(value, [["parsed", "type"], ["instructionType"], ["type"]]));
    const isMemoInstruction = program?.includes("memo") || parsedType === "memo";
    if (!isMemoInstruction) continue;

    const parsedMemo = firstString(value, [["parsed", "info", "memo"], ["memo"]]);
    if (parsedMemo?.trim()) {
      return parsedMemo.trim();
    }

    const rawData = firstString(value, [["data"]]);
    if (!rawData?.trim()) continue;
    const decodedMemo = decodeBase58MemoData(rawData.trim());
    if (decodedMemo) {
      return decodedMemo;
    }
  }
  return undefined;
}

function extractMemoFromLogs(candidate: UnknownRecord): string | undefined {
  const logMessages = firstArray(candidate, [
    ["logMessages"],
    ["meta", "logMessages"],
    ["transaction", "meta", "logMessages"],
  ]);
  if (!logMessages) return undefined;
  for (const value of logMessages) {
    if (typeof value !== "string") continue;
    const match = value.match(/Memo(?:\s*\(len\s+\d+\))?:\s*"([^"]+)"/);
    if (match?.[1]) return match[1];
  }
  return undefined;
}

function findMatchingTransfer(
  candidate: UnknownRecord,
  expectedMint: string,
  expectedRecipient: string,
):
  | { kind: "ok"; amountCents: number }
  | { kind: "mint_or_recipient_mismatch" }
  | { kind: "no_amount" } {
  const transfers = listTokenTransfers(candidate);
  if (transfers.length === 0) return { kind: "mint_or_recipient_mismatch" };

  let sawMintOrRecipientMismatch = false;
  for (const transfer of transfers) {
    const mint = toLower(firstString(transfer, [["mint"], ["tokenMint"]]));
    const recipient = toLower(
      firstString(transfer, [
        ["toUserAccount"],
        ["toAccount"],
        ["to"],
        ["destination"],
      ]),
    );
    const mintMatches = mint === toLower(expectedMint);
    const recipientMatches = recipient === toLower(expectedRecipient);
    if (!mintMatches || !recipientMatches) {
      sawMintOrRecipientMismatch = true;
      continue;
    }
    const amountCents = extractAmountCents(transfer);
    if (amountCents === null) return { kind: "no_amount" };
    return { kind: "ok", amountCents };
  }

  return sawMintOrRecipientMismatch
    ? { kind: "mint_or_recipient_mismatch" }
    : { kind: "mint_or_recipient_mismatch" };
}

function listTokenTransfers(candidate: UnknownRecord): UnknownRecord[] {
  const transfers = firstArray(candidate, [
    ["tokenTransfers"],
    ["events", "tokenTransfers"],
  ]);
  if (!transfers) return [];
  return transfers.filter(isRecord);
}

function extractAmountCents(transfer: UnknownRecord): number | null {
  const uiAmount = firstNumber(transfer, [["tokenAmount"], ["amount"], ["uiAmount"]]);
  if (uiAmount !== null) {
    if (!Number.isFinite(uiAmount) || uiAmount <= 0) return null;
    const cents = Math.round(uiAmount * 100);
    return cents > 0 ? cents : null;
  }

  const rawTokenAmount = getPath(transfer, ["rawTokenAmount"]);
  if (!isRecord(rawTokenAmount)) return null;
  const raw = firstString(rawTokenAmount, [["tokenAmount"], ["amount"]]);
  const decimals = firstNumber(rawTokenAmount, [["decimals"]]);
  if (!raw || decimals === null || !Number.isInteger(decimals)) return null;
  if (!/^\d+$/.test(raw)) return null;

  try {
    const rawUnits = BigInt(raw);
    if (rawUnits <= 0n) return null;
    if (decimals < 2) return null;
    const divisor = 10n ** BigInt(decimals - 2);
    if (divisor <= 0n) return null;
    if (rawUnits % divisor !== 0n) return null;
    const cents = rawUnits / divisor;
    const asNumber = Number(cents);
    return Number.isSafeInteger(asNumber) ? asNumber : null;
  } catch {
    return null;
  }
}

function firstArray(record: UnknownRecord, paths: string[][]): unknown[] | undefined {
  for (const path of paths) {
    const value = getPath(record, path);
    if (Array.isArray(value)) return value;
  }
  return undefined;
}

function firstString(record: UnknownRecord, paths: string[][]): string | undefined {
  for (const path of paths) {
    const value = getPath(record, path);
    if (typeof value === "string") return value;
  }
  return undefined;
}

function firstNumber(record: UnknownRecord, paths: string[][]): number | null {
  for (const path of paths) {
    const value = getPath(record, path);
    if (typeof value === "number") return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function getPath(value: unknown, path: string[]): unknown {
  let current: unknown = value;
  for (const key of path) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toLower(value: string | undefined): string | undefined {
  return value?.toLowerCase();
}

function decodeBase58MemoData(input: string): string | undefined {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const map = new Map<string, number>();
  for (let i = 0; i < alphabet.length; i += 1) {
    map.set(alphabet[i], i);
  }

  const bytes: number[] = [0];
  for (const char of input) {
    const value = map.get(char);
    if (value === undefined) return undefined;
    let carry = value;
    for (let i = 0; i < bytes.length; i += 1) {
      const next = bytes[i] * 58 + carry;
      bytes[i] = next & 0xff;
      carry = next >> 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  let leadingOnes = 0;
  while (leadingOnes < input.length && input[leadingOnes] === "1") {
    bytes.push(0);
    leadingOnes += 1;
  }

  const decodedBytes = Uint8Array.from(bytes.reverse());
  try {
    const memo = new TextDecoder("utf-8", { fatal: true }).decode(decodedBytes).trim();
    return memo || undefined;
  } catch {
    return undefined;
  }
}
