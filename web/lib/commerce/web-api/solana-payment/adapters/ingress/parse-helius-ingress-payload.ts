import { CART_B64_KEY, CART_CODEC_ID_V1, CART_CODEC_KEY } from "@ricos/shared";
import {
  isInstructionForProgram,
  isInstructionWithAccounts,
  isInstructionWithData,
  type AccountMeta
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
  TOKEN_PROGRAM_ADDRESS,
  TokenInstruction,
} from "@solana-program/token";
import {
  identifyToken2022Instruction,
  parseTransferCheckedInstruction as parseTransferCheckedInstruction2022,
  TOKEN_2022_PROGRAM_ADDRESS,
  Token2022Instruction,
} from "@solana-program/token-2022";
import type { NormalizedIngressEvent } from "@/lib/commerce/domain";
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

export type HeliusIngressParseResult =
  | { kind: "error"; status: number; message: string }
  | {
      kind: "ok";
      events: NormalizedIngressEvent[];
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

  const normalizedEvents: NormalizedIngressEvent[] = [];
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
    normalizedEvents.push(maybeEvent.event);
  }

  return { kind: "ok", events: normalizedEvents, ignoredCount, ignoredDetails };
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
  | { kind: "event"; event: NormalizedIngressEvent } {
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
  const accountAddresses = accountMetas.map((meta) => String(meta.address));
  const tokenAccountOwners = buildTokenAccountOwnerMap(meta, accountAddresses);

  const memo = extractMemoFromInstructions(instructions) ?? extractMemoFromLogs(meta);
  const matchingTransfer = findMatchingTransferChecked(
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
      provider: "helius",
      paymentIngressEventId: `evt_helius_${signature}`,
      paymentReferenceId: matchingTransfer.orderReference,
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

type TokenAccountInfo = { owner: string; mint: string };

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
    if (accountIndex === null || !owner || !mint) continue;
    const address = accountAddresses[accountIndex];
    if (!address || map.has(address)) continue;
    map.set(address, { owner, mint });
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
  | { kind: "ok"; grandTotalCents: number; orderReference: string }
  | { kind: "none" }
  | { kind: "mint_or_recipient_mismatch" }
  | { kind: "no_amount" }
  | { kind: "missing_reference" };

function findMatchingTransferChecked(
  instructions: readonly TracedInstruction[],
  tokenAccountOwners: Map<string, TokenAccountInfo>,
  expectedMint: string,
  expectedRecipient: string,
): MatchingTransfer {
  const expectedMintLower = expectedMint.toLowerCase();
  const expectedRecipientLower = expectedRecipient.toLowerCase();

  let sawAnyTransferChecked = false;
  let sawMintOrRecipientMismatch = false;
  let sawInvalidAmount = false;
  let sawMissingReference = false;

  for (const ix of instructions) {
    if (!isInstructionWithData(ix) || !isInstructionWithAccounts(ix)) continue;

    let parsed:
      | {
          accounts: {
            mint: { address: string };
            destination: { address: string };
          };
          data: { amount: bigint; decimals: number };
        }
      | null = null;

    if (isInstructionForProgram(ix, TOKEN_PROGRAM_ADDRESS)) {
      if (identifyTokenInstruction(ix) !== TokenInstruction.TransferChecked) continue;
      sawAnyTransferChecked = true;
      parsed = parseTransferCheckedInstruction(ix);
    } else if (isInstructionForProgram(ix, TOKEN_2022_PROGRAM_ADDRESS)) {
      if (identifyToken2022Instruction(ix) !== Token2022Instruction.TransferChecked) continue;
      sawAnyTransferChecked = true;
      parsed = parseTransferCheckedInstruction2022(ix);
    } else {
      continue;
    }

    const mintAddress = String(parsed.accounts.mint.address);
    const destinationAta = String(parsed.accounts.destination.address);
    const destInfo = tokenAccountOwners.get(destinationAta);
    const owner = destInfo?.owner;
    const balanceMint = destInfo?.mint;

    const mintMatches =
      mintAddress.toLowerCase() === expectedMintLower ||
      (balanceMint != null && balanceMint.toLowerCase() === expectedMintLower);
    const recipientMatches =
      owner != null && owner.toLowerCase() === expectedRecipientLower;

    if (!mintMatches || !recipientMatches) {
      sawMintOrRecipientMismatch = true;
      continue;
    }

    if (parsed.data.decimals !== USDC_DECIMALS) {
      sawInvalidAmount = true;
      continue;
    }

    const grandTotalCents = baseUnitsToCents(parsed.data.amount);
    if (grandTotalCents === null) {
      sawInvalidAmount = true;
      continue;
    }

    const orderReference = extractSolanaPayReference(ix.accounts);
    if (!orderReference) {
      sawMissingReference = true;
      continue;
    }

    return { kind: "ok", grandTotalCents, orderReference };
  }

  if (!sawAnyTransferChecked) return { kind: "none" };
  if (sawMissingReference) return { kind: "missing_reference" };
  if (sawInvalidAmount) return { kind: "no_amount" };
  if (sawMintOrRecipientMismatch) return { kind: "mint_or_recipient_mismatch" };
  return { kind: "none" };
}

/**
 * Solana Pay appends the order reference as a readonly account after the four
 * TransferChecked accounts (source, mint, destination, authority). Prefer the
 * last remaining account so both the 5-account (spec) and 6-account (wallet)
 * shapes resolve to the reference.
 */
function extractSolanaPayReference(accounts: readonly AccountMeta[]): string | undefined {
  if (accounts.length <= 4) return undefined;
  const reference = accounts[accounts.length - 1]?.address;
  return typeof reference === "string" && reference.trim() ? String(reference).trim() : undefined;
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
