import { createClient, type Client } from "@libsql/client";
import {
  buildDecodeIndex,
  canonicalJson,
  type DecodeIndex,
  type MenuVersion,
} from "@ricos/shared";
import type { KitchenOrderPayload } from "@/lib/commerce/domain";

export type PendingPaymentStatus = "pending" | "confirmed" | "expired";

export type PendingPaymentRecord = {
  reference: string;
  metadataJson: string;
  issuedAt: number;
  expiresAt: number;
  status: PendingPaymentStatus;
  signature?: string;
};

export function openDb(url: string, authToken: string): Client {
  return createClient({ url, authToken });
}

export async function migrate(client: Client): Promise<void> {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS kitchen_orders (
      payment_ingress_event_id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS menu_versions (
      version       INTEGER PRIMARY KEY,
      published_at  INTEGER NOT NULL,
      catalog_json  TEXT    NOT NULL,
      decode_index  TEXT    NOT NULL,
      content_hash  TEXT    NOT NULL UNIQUE
    )
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS pending_payments (
      reference     TEXT PRIMARY KEY,
      metadata_json TEXT NOT NULL,
      issued_at     INTEGER NOT NULL,
      expires_at    INTEGER NOT NULL,
      status        TEXT NOT NULL DEFAULT 'pending',
      signature     TEXT
    )
  `);
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_pending_payments_status_expires_at
    ON pending_payments(status, expires_at)
  `);
}

export async function insertPendingIfNew(
  client: Client,
  payload: KitchenOrderPayload,
): Promise<boolean> {
  const result = await client.execute({
    sql: `INSERT OR IGNORE INTO kitchen_orders (payment_ingress_event_id, payload, created_at) VALUES (?, ?, ?)`,
    args: [payload.paymentIngressEventId, JSON.stringify(payload), Date.now()],
  });
  return (result.rowsAffected ?? 0) > 0;
}

export async function listPending(client: Client): Promise<KitchenOrderPayload[]> {
  const result = await client.execute(`SELECT payload FROM kitchen_orders ORDER BY created_at ASC`);
  const rows = (result.rows ?? []) as Record<string, unknown>[];
  return rows.map((row) => {
    const raw = row.payload ?? row.PAYLOAD;
    return JSON.parse(String(raw)) as KitchenOrderPayload;
  });
}

export async function deletePending(client: Client, paymentIngressEventId: string): Promise<void> {
  await client.execute({
    sql: `DELETE FROM kitchen_orders WHERE payment_ingress_event_id = ?`,
    args: [paymentIngressEventId],
  });
}

export async function insertPendingPaymentIfNew(
  client: Client,
  record: PendingPaymentRecord,
): Promise<boolean> {
  const result = await client.execute({
    sql: `
      INSERT OR IGNORE INTO pending_payments (
        reference,
        metadata_json,
        issued_at,
        expires_at,
        status,
        signature
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    args: [
      record.reference,
      record.metadataJson,
      record.issuedAt,
      record.expiresAt,
      record.status,
      record.signature ?? null,
    ],
  });
  return (result.rowsAffected ?? 0) > 0;
}

function rowToPendingPayment(row: Record<string, unknown>): PendingPaymentRecord {
  return {
    reference: String(row.reference ?? row.REFERENCE ?? ""),
    metadataJson: String(row.metadata_json ?? row.METADATA_JSON ?? ""),
    issuedAt: Number(row.issued_at ?? row.ISSUED_AT ?? 0),
    expiresAt: Number(row.expires_at ?? row.EXPIRES_AT ?? 0),
    status: String(row.status ?? row.STATUS ?? "pending") as PendingPaymentStatus,
    signature:
      (row.signature ?? row.SIGNATURE) === null
        ? undefined
        : String(row.signature ?? row.SIGNATURE ?? ""),
  };
}

/** Returns pending_payment rows for any of the given reference pubkeys (order not preserved). */
export async function getPendingPaymentsByReferences(
  client: Client,
  references: string[],
): Promise<Map<string, PendingPaymentRecord>> {
  const out = new Map<string, PendingPaymentRecord>();
  const unique = [...new Set(references.filter((r) => typeof r === "string" && r.length > 0))];
  if (unique.length === 0) return out;

  const placeholders = unique.map(() => "?").join(", ");
  const result = await client.execute({
    sql: `
      SELECT reference, metadata_json, issued_at, expires_at, status, signature
      FROM pending_payments
      WHERE reference IN (${placeholders})
    `,
    args: unique,
  });
  const rows = (result.rows ?? []) as Record<string, unknown>[];
  for (const row of rows) {
    const rec = rowToPendingPayment(row);
    out.set(rec.reference, rec);
  }
  return out;
}

export async function markPendingPaymentConfirmed(
  client: Client,
  reference: string,
  signature: string,
): Promise<void> {
  await client.execute({
    sql: `UPDATE pending_payments SET status = 'confirmed', signature = ? WHERE reference = ?`,
    args: [signature, reference],
  });
}

const decodeIndexCache = new Map<number, DecodeIndex>();

async function sha256Hex(value: string): Promise<string> {
  const input = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", input);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function seedMenuVersions(
  client: Client,
  registry: Readonly<Record<number, MenuVersion>>,
): Promise<void> {
  decodeIndexCache.clear();

  const versions = Object.values(registry).sort((a, b) => a.version - b.version);
  for (const entry of versions) {
    const canonicalCatalog = canonicalJson(entry.catalog);
    const decodeIndex = buildDecodeIndex(entry.version, entry.catalog);
    const canonicalDecodeIndex = canonicalJson(decodeIndex);
    const hash = await sha256Hex(canonicalCatalog);
    const publishedAtMs = Date.parse(entry.publishedAt);
    if (!Number.isFinite(publishedAtMs)) {
      throw new Error(`menuVersion ${entry.version} has invalid publishedAt`);
    }

    const existing = await client.execute({
      sql: `SELECT content_hash FROM menu_versions WHERE version = ?`,
      args: [entry.version],
    });
    const rows = (existing.rows ?? []) as Record<string, unknown>[];

    if (rows.length > 0) {
      const storedHash = String(rows[0].content_hash ?? rows[0].CONTENT_HASH ?? "");
      if (storedHash !== hash) {
        throw new Error(
          `menu_versions drift detected for version ${entry.version}: ` +
            `stored hash ${storedHash} does not match registry hash ${hash}. ` +
            `Published versions must be immutable; mint a new version instead of editing.`,
        );
      }
    } else {
      await client.execute({
        sql: `INSERT INTO menu_versions (version, published_at, catalog_json, decode_index, content_hash) VALUES (?, ?, ?, ?, ?)`,
        args: [entry.version, publishedAtMs, canonicalCatalog, canonicalDecodeIndex, hash],
      });
    }

    decodeIndexCache.set(entry.version, decodeIndex);
  }
}

export function getDecodeIndex(version: number): DecodeIndex | undefined {
  return decodeIndexCache.get(version);
}
