type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstArray(record: UnknownRecord, paths: string[][]): unknown[] | undefined {
  for (const path of paths) {
    let current: unknown = record;
    for (const key of path) {
      if (!isRecord(current)) {
        current = undefined;
        break;
      }
      current = current[key];
    }
    if (Array.isArray(current)) return current;
  }
  return undefined;
}

function firstString(record: UnknownRecord, paths: string[][]): string | undefined {
  for (const path of paths) {
    let current: unknown = record;
    for (const key of path) {
      if (!isRecord(current)) {
        current = undefined;
        break;
      }
      current = current[key];
    }
    if (typeof current === "string" && current.trim()) return current.trim();
  }
  return undefined;
}

function listTokenTransfers(candidate: UnknownRecord): UnknownRecord[] {
  const transfers = firstArray(candidate, [["tokenTransfers"], ["events", "tokenTransfers"]]);
  if (!transfers) return [];
  return transfers.filter(isRecord);
}

function toLower(value: string | undefined): string | undefined {
  return value?.toLowerCase();
}

/**
 * Returns the wallet that sent USDC to the merchant on the original payment tx.
 * Uses Helius `tokenTransfers` only (no instruction account index math).
 */
export function extractUsdcPayerFromHeliusTransaction(
  transaction: UnknownRecord,
  params: { expectedMint: string; expectedRecipient: string },
): string | null {
  const expectedMint = toLower(params.expectedMint);
  const expectedRecipient = toLower(params.expectedRecipient);
  if (!expectedMint || !expectedRecipient) return null;

  for (const transfer of listTokenTransfers(transaction)) {
    const mint = toLower(firstString(transfer, [["mint"], ["tokenMint"]]));
    const recipient = toLower(
      firstString(transfer, [
        ["toUserAccount"],
        ["toAccount"],
        ["to"],
        ["destination"],
      ]),
    );
    if (mint !== expectedMint || recipient !== expectedRecipient) continue;

    const payer = firstString(transfer, [
      ["fromUserAccount"],
      ["fromAccount"],
      ["from"],
      ["source"],
    ]);
    if (payer) return payer;
  }

  return null;
}
