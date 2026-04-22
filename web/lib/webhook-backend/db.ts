import { createHash } from "node:crypto";
import { createClient, type Client } from "@libsql/client";
import {
  buildDecodeIndex,
  canonicalJson,
  type DecodeIndex,
  type MenuVersion,
} from "@ricos/shared";

export type KitchenOrderPayload = {
  stripeEventId: string;
  paymentIntentId: string;
  amountCents: number;
  currency: string;
  lines: {
    id: string;
    quantity: number;
    selections: Record<string, string[]>;
    unitBasePriceCents: number;
    selectedModifiers: { groupId: string; optionId: string; optionSurchargeCents: number }[];
    lineUnitTotalCents: number;
    lineExtendedTotalCents: number;
  }[];
};

export function openDb(url: string, authToken: string): Client {
  return createClient({ url, authToken });
}

export async function migrate(client: Client): Promise<void> {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS kitchen_orders (
      stripe_event_id TEXT PRIMARY KEY,
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
}

export async function insertPendingIfNew(
  client: Client,
  payload: KitchenOrderPayload,
): Promise<boolean> {
  const result = await client.execute({
    sql: `INSERT OR IGNORE INTO kitchen_orders (stripe_event_id, payload, created_at) VALUES (?, ?, ?)`,
    args: [payload.stripeEventId, JSON.stringify(payload), Date.now()],
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

export async function deletePending(client: Client, stripeEventId: string): Promise<void> {
  await client.execute({
    sql: `DELETE FROM kitchen_orders WHERE stripe_event_id = ?`,
    args: [stripeEventId],
  });
}

const decodeIndexCache = new Map<number, DecodeIndex>();

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
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
    const hash = sha256Hex(canonicalCatalog);
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
