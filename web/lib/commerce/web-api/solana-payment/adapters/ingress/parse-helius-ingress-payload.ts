import { CART_B64_KEY, CART_CODEC_ID_V1, CART_CODEC_KEY } from "@ricos/shared";
import {
  isInstructionForProgram,
  isInstructionWithAccounts,
  isInstructionWithData,
  type AccountMeta,
} from "@solana/kit";
import {
  decodeTransactionFromRpcResponse,
  getAccountMetasFromCompiledTransactionMessage,
  walkInstructions,
  type TracedInstruction,
} from "@solana/transaction-introspection";
import {
  identifyTokenInstruction,
  parseTransferCheckedInstruction,
  parseTransferInstruction,
  TOKEN_PROGRAM_ADDRESS,
  TokenInstruction,
} from "@solana-program/token";
import {
  identifyToken2022Instruction,
  parseTransferCheckedInstruction as parseTransferCheckedInstruction2022,
  parseTransferInstruction as parseTransferInstruction2022,
  TOKEN_2022_PROGRAM_ADDRESS,
  Token2022Instruction,
} from "@solana-program/token-2022";
import { isHeliusWebhookDebugEnabled } from "@/lib/commerce/web-api/solana-payment/config";

type UnknownRecord = Record<string, unknown>;

const MEMO_PROGRAM_V2 = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
const MEMO_PROGRAM_V1 = "Memo1UhkJRfHyvLMcVucLZWowqXF4asSHPmIhcyAn2F";
/** USDC and USDC-devnet mints use 6 decimals. */
const USDC_DECIMALS = 6;

export type HeliusIngressConfig = {
  authHeaderName: string;
  authHeaderValue?: string;
  expectedUsdcMint: string;
  expectedRecipient: string;
};

/** Parsed Helius payment before DB resolves which remaining account is the order reference. */
export type HeliusIngressPayment = {
  paymentIngressEventId: string;
  orderReferenceCandidates: string[];
  grandTotalCents: number;
  currency: "usdc";
  metadata: Record<string, string | undefined>;
};

export type HeliusIngressParseResult =
  | { kind: "error"; status: number; message: string }
  | {
      kind: "ok";
      events: HeliusIngressPayment[];
      ignoredCount: number;
      ignoredDetails: { signature: string; reason: string }[];
    };

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
    console.log("Invalid Helius payload: no events", body, headers, config);
    return { kind: "error", status: 400, message: "Invalid Helius payload: no events" };
  }

  const events: HeliusIngressPayment[] = [];
  let ignoredCount = 0;
  const ignoredDetails: { signature: string; reason: string }[] = [];

  for (const candidate of candidates) {
    const maybeEvent = parseCandidate(candidate, config);
    if (maybeEvent.kind === "ignore") {
      ignoredCount += 1;
      ignoredDetails.push({ signature: maybeEvent.signature, reason: maybeEvent.reason });
      if (isHeliusWebhookDebugEnabled()) {
        console.info("Helius ingress discarded:", candidate);
      }
      continue;
    }
    events.push(maybeEvent.event);
  }

  return { kind: "ok", events, ignoredCount, ignoredDetails };
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
  | { kind: "ignore"; signature: string; reason: string }
  | { kind: "event"; event: HeliusIngressPayment } {
  const signature = extractSignature(candidate);
  if (!signature) {
    return { kind: "ignore", signature: "missing_signature", reason: "missing_signature" };
  }

  const meta = isRecord(candidate.meta) ? candidate.meta : null;
  if (meta && meta.err != null) {
    return { kind: "ignore", signature, reason: "failed_transaction" };
  }

  let decoded;
  try {
    decoded = decodeTransactionFromRpcResponse(candidate as never);
  } catch {
    return { kind: "ignore", signature, reason: "undecodable_transaction" };
  }

  const { compiledMessage, loadedAddresses } = decoded;
  const instructions = walkInstructions({
    compiledMessage,
    loadedAddresses,
    meta: meta as never,
  });

  const accountMetas = getAccountMetasFromCompiledTransactionMessage(
    compiledMessage,
    loadedAddresses,
  );
  const accountAddresses = accountMetas.map((m) => String(m.address));
  const tokenAccountOwners = buildTokenAccountOwnerMap(meta, accountAddresses);

  const memo = extractMemoFromInstructions(instructions) ?? extractMemoFromLogs(meta);
  const matchingTransfer = findMatchingTransfer(
    instructions,
    tokenAccountOwners,
    config.expectedUsdcMint,
    config.expectedRecipient,
  );

  const hasMemo = Boolean(memo);
  const hasAnyTransfer = matchingTransfer.kind !== "none";
  if (!hasMemo && !hasAnyTransfer) {
    return { kind: "ignore", signature, reason: "non_solana_pay_candidate" };
  }
  if (!hasMemo) {
    return { kind: "ignore", signature, reason: "missing_memo" };
  }
  if (matchingTransfer.kind === "none") {
    return { kind: "ignore", signature, reason: "missing_token_transfer" };
  }
  if (matchingTransfer.kind === "mint_or_recipient_mismatch") {
    return { kind: "ignore", signature, reason: "mint_or_recipient_mismatch" };
  }
  if (matchingTransfer.kind === "no_amount") {
    return { kind: "ignore", signature, reason: "invalid_transfer_amount" };
  }
  if (matchingTransfer.kind === "missing_reference") {
    return { kind: "ignore", signature, reason: "missing_solana_pay_order_reference" };
  }

  return {
    kind: "event",
    event: {
      paymentIngressEventId: `evt_helius_${signature}`,
      orderReferenceCandidates: matchingTransfer.orderReferenceCandidates,
      grandTotalCents: matchingTransfer.grandTotalCents,
      currency: "usdc",
      metadata: {
        [CART_CODEC_KEY]: CART_CODEC_ID_V1,
        [CART_B64_KEY]: memo!,
      },
    },
  };
}

function extractSignature(candidate: UnknownRecord): string | undefined {
  const transaction = candidate.transaction;
  if (isRecord(transaction) && Array.isArray(transaction.signatures)) {
    const first = transaction.signatures[0];
    if (typeof first === "string" && first.trim()) return first.trim();
  }
  return undefined;
}

type TokenAccountInfo = { owner: string; mint: string; decimals: number };

function buildTokenAccountOwnerMap(
  meta: UnknownRecord | null,
  accountAddresses: string[],
): Map<string, TokenAccountInfo> {
  const map = new Map<string, TokenAccountInfo>();
  if (!meta) return map;

  const balances = [
    ...(Array.isArray(meta.preTokenBalances) ? meta.preTokenBalances : []),
    ...(Array.isArray(meta.postTokenBalances) ? meta.postTokenBalances : []),
  ];

  for (const entry of balances) {
    if (!isRecord(entry)) continue;
    const accountIndex = typeof entry.accountIndex === "number" ? entry.accountIndex : null;
    const owner = typeof entry.owner === "string" ? entry.owner : null;
    const mint = typeof entry.mint === "string" ? entry.mint : null;
    const tokenAmount = isRecord(entry.uiTokenAmount) ? entry.uiTokenAmount : null;
    const decimals = typeof tokenAmount?.decimals === "number" ? tokenAmount.decimals : null;
    if (accountIndex === null || !owner || !mint || decimals === null) continue;
    const address = accountAddresses[accountIndex];
    if (!address || map.has(address)) continue;
    map.set(address, { owner, mint, decimals });
  }
  return map;
}

function extractMemoFromInstructions(instructions: readonly TracedInstruction[]): string | undefined {
  for (const ix of instructions) {
    const program = String(ix.programAddress);
    if (program !== MEMO_PROGRAM_V2 && program !== MEMO_PROGRAM_V1) continue;
    if (!ix.data || ix.data.length === 0) continue;
    try {
      const memo = new TextDecoder("utf-8", { fatal: true }).decode(ix.data).trim();
      if (memo) return memo;
    } catch {
      continue;
    }
  }
  return undefined;
}

function extractMemoFromLogs(meta: UnknownRecord | null): string | undefined {
  if (!meta) return undefined;
  const logMessages = meta.logMessages;
  if (!Array.isArray(logMessages)) return undefined;

  for (const value of logMessages) {
    if (typeof value !== "string") continue;
    const match = value.match(/Memo(?:\s*\(len\s+\d+\))?:\s*"([^"]+)"/);
    if (match?.[1]) return match[1];
  }
  return undefined;
}

type MatchingTransfer =
  | { kind: "ok"; grandTotalCents: number; orderReferenceCandidates: string[] }
  | { kind: "none" }
  | { kind: "mint_or_recipient_mismatch" }
  | { kind: "no_amount" }
  | { kind: "missing_reference" };

function findMatchingTransfer(
  instructions: readonly TracedInstruction[],
  tokenAccountOwners: Map<string, TokenAccountInfo>,
  expectedMint: string,
  expectedRecipient: string,
): MatchingTransfer {
  let sawAnyTransfer = false;
  let sawMintOrRecipientMismatch = false;
  let sawInvalidAmount = false;
  let sawMissingReference = false;

  for (const ix of instructions) {
    if (!isInstructionWithData(ix) || !isInstructionWithAccounts(ix)) continue;

    let parsed: {
      accounts: {
        mint?: { address: string };
        destination: { address: string };
      };
      data: { amount: bigint; decimals?: number };
    };
    let referenceAccountOffset: number;

    if (isInstructionForProgram(ix, TOKEN_PROGRAM_ADDRESS)) {
      const instruction = identifyTokenInstruction(ix);
      if (instruction === TokenInstruction.TransferChecked) {
        parsed = parseTransferCheckedInstruction(ix);
        referenceAccountOffset = 4;
      } else if (instruction === TokenInstruction.Transfer) {
        parsed = parseTransferInstruction(ix);
        referenceAccountOffset = 3;
      } else {
        continue;
      }
    } else if (isInstructionForProgram(ix, TOKEN_2022_PROGRAM_ADDRESS)) {
      const instruction = identifyToken2022Instruction(ix);
      if (instruction === Token2022Instruction.TransferChecked) {
        parsed = parseTransferCheckedInstruction2022(ix);
        referenceAccountOffset = 4;
      } else if (instruction === Token2022Instruction.Transfer) {
        parsed = parseTransferInstruction2022(ix);
        referenceAccountOffset = 3;
      } else {
        continue;
      }
    } else {
      continue;
    }

    sawAnyTransfer = true;
    const destinationAta = String(parsed.accounts.destination.address);
    const destInfo = tokenAccountOwners.get(destinationAta);
    // Transfer omits the mint and decimals. Resolve them from the destination's
    // transaction token balances; TransferChecked must agree with those balances.
    if (
      !destInfo ||
      destInfo.mint !== expectedMint ||
      destInfo.owner !== expectedRecipient ||
      (parsed.accounts.mint && String(parsed.accounts.mint.address) !== expectedMint)
    ) {
      sawMintOrRecipientMismatch = true;
      continue;
    }

    if (
      destInfo.decimals !== USDC_DECIMALS ||
      (parsed.data.decimals !== undefined && parsed.data.decimals !== USDC_DECIMALS)
    ) {
      sawInvalidAmount = true;
      continue;
    }

    const grandTotalCents = baseUnitsToCents(parsed.data.amount);
    if (grandTotalCents === null) {
      sawInvalidAmount = true;
      continue;
    }

    const orderReferenceCandidates = collectSolanaPayOrderReferenceCandidates(
      ix.accounts,
      referenceAccountOffset,
    );
    if (orderReferenceCandidates.length === 0) {
      sawMissingReference = true;
      continue;
    }

    return { kind: "ok", grandTotalCents, orderReferenceCandidates };
  }

  if (!sawAnyTransfer) return { kind: "none" };
  if (sawMissingReference) return { kind: "missing_reference" };
  if (sawInvalidAmount) return { kind: "no_amount" };
  if (sawMintOrRecipientMismatch) return { kind: "mint_or_recipient_mismatch" };
  return { kind: "none" };
}

/**
 * Solana Pay appends reference key(s) after the three Transfer accounts or four
 * TransferChecked accounts. Collect all remaining addresses;
 * DB lookup later picks the one that matches a purchase order.
 */
function collectSolanaPayOrderReferenceCandidates(
  accounts: readonly AccountMeta[],
  referenceAccountOffset: number,
): string[] {
  if (accounts.length <= referenceAccountOffset) return [];
  const out: string[] = [];
  for (let i = referenceAccountOffset; i < accounts.length; i += 1) {
    const address = accounts[i]?.address;
    if (typeof address !== "string") continue;
    const trimmed = String(address).trim();
    if (trimmed) out.push(trimmed);
  }
  return out;
}

function baseUnitsToCents(rawUnits: bigint): number | null {
  if (rawUnits <= BigInt(0)) return null;
  const divisor = BigInt(10) ** BigInt(USDC_DECIMALS - 2);
  if (rawUnits % divisor !== BigInt(0)) return null;
  const cents = rawUnits / divisor;
  const asNumber = Number(cents);
  return Number.isSafeInteger(asNumber) && asNumber > 0 ? asNumber : null;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
