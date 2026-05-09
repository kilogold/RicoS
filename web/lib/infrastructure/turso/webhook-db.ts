import { createClient, type Client } from "@libsql/client";
import {
  buildDecodeIndex,
  buildManifestForHash,
  canonicalJson,
  computeMenuContentHash,
  getPackagedMenuCatalogParsed,
  type DecodeIndex,
  type MenuDocument,
  type ParsedMenuCatalogFile,
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

  await backfillMenuVersionContentHashes(client);
}

/**
 * Legacy seed used `sha256(canonicalJson(catalog))` only. Recompute full-manifest hashes in place
 * so `upsertMenuVersionForPublish` immutability checks match deployed rows.
 */
async function backfillMenuVersionContentHashes(client: Client): Promise<void> {
  const result = await client.execute(
    `SELECT version, published_at, catalog_json, content_hash FROM menu_versions ORDER BY version ASC`,
  );
  const rows = (result.rows ?? []) as Record<string, unknown>[];
  for (const row of rows) {
    const version = Number(row.version ?? row.VERSION ?? 0);
    const publishedAtMs = Number(row.published_at ?? row.PUBLISHED_AT ?? 0);
    const catalogRaw = row.catalog_json ?? row.CATALOG_JSON;
    const storedHash = String(row.content_hash ?? row.CONTENT_HASH ?? "");
    if (!Number.isInteger(version) || version < 1 || !Number.isFinite(publishedAtMs)) continue;
    let catalog: MenuDocument;
    try {
      catalog = JSON.parse(String(catalogRaw)) as MenuDocument;
    } catch {
      continue;
    }
    const manifest = buildManifestForHash({ catalogVersion: version, publishedAtMs, catalog });
    const nextHash = await computeMenuContentHash(manifest);
    if (nextHash !== storedHash) {
      await client.execute({
        sql: `UPDATE menu_versions SET content_hash = ? WHERE version = ?`,
        args: [nextHash, version],
      });
    }
  }
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

export function getDecodeIndex(version: number): DecodeIndex | undefined {
  return decodeIndexCache.get(version);
}

/**
 * Load all `menu_versions` rows into the in-memory decode index map (webhook runtime).
 */
export async function hydrateMenuCachesFromDb(client: Client): Promise<void> {
  decodeIndexCache.clear();
  const result = await client.execute(`SELECT version, decode_index FROM menu_versions ORDER BY version ASC`);
  const rows = (result.rows ?? []) as Record<string, unknown>[];
  for (const row of rows) {
    const version = Number(row.version ?? row.VERSION ?? 0);
    const raw = row.decode_index ?? row.DECODE_INDEX;
    const decodeIndex = JSON.parse(String(raw)) as DecodeIndex;
    decodeIndexCache.set(version, decodeIndex);
  }
}

async function selectMaxMenuVersion(client: Client): Promise<number | null> {
  const result = await client.execute(`SELECT MAX(version) AS m FROM menu_versions`);
  const rows = (result.rows ?? []) as Record<string, unknown>[];
  if (rows.length === 0) return null;
  const m = rows[0].m ?? rows[0].M;
  if (m === null || m === undefined) return null;
  const n = Number(m);
  return Number.isFinite(n) ? n : null;
}

async function menuVersionsRowCount(client: Client): Promise<number> {
  const result = await client.execute(`SELECT COUNT(*) AS c FROM menu_versions`);
  const rows = (result.rows ?? []) as Record<string, unknown>[];
  return Number(rows[0]?.c ?? rows[0]?.C ?? 0);
}

/**
 * Insert or verify an immutable menu version row (staff publish).
 * Enforces `catalogVersion === MAX(version)+1` when the table is non-empty, and for each new
 * row `publishedAt` strictly after the previous version’s `published_at`.
 */
export async function upsertMenuVersionForPublish(
  client: Client,
  parsed: ParsedMenuCatalogFile,
): Promise<void> {
  const maxV = await selectMaxMenuVersion(client);
  const publishedAtMs = Date.parse(parsed.publishedAtIso);
  if (!Number.isFinite(publishedAtMs)) {
    throw new Error(`menu publish: invalid publishedAt for version ${parsed.catalogVersion}`);
  }

  if (maxV !== null && parsed.catalogVersion !== maxV + 1) {
    throw new Error(
      `menu publish: catalogVersion ${parsed.catalogVersion} must be ${maxV + 1} (monotonic publish)`,
    );
  }

  const existing = await client.execute({
    sql: `SELECT content_hash FROM menu_versions WHERE version = ?`,
    args: [parsed.catalogVersion],
  });
  const existingRows = (existing.rows ?? []) as Record<string, unknown>[];

  if (existingRows.length === 0 && maxV !== null) {
    const prevAt = await client.execute({
      sql: `SELECT published_at FROM menu_versions WHERE version = ?`,
      args: [maxV],
    });
    const prevRows = (prevAt.rows ?? []) as Record<string, unknown>[];
    const prevMs = Number(prevRows[0]?.published_at ?? prevRows[0]?.PUBLISHED_AT ?? NaN);
    if (!Number.isFinite(prevMs)) {
      throw new Error(`menu publish: invalid published_at stored for version ${maxV}`);
    }
    if (publishedAtMs <= prevMs) {
      throw new Error(
        `menu publish: publishedAt must be later than version ${maxV} (${new Date(prevMs).toISOString()}); ` +
          `got ${new Date(publishedAtMs).toISOString()}`,
      );
    }
  }

  const manifest = buildManifestForHash({
    catalogVersion: parsed.catalogVersion,
    publishedAtMs,
    catalog: parsed.catalog,
  });
  const contentHash = await computeMenuContentHash(manifest);
  const catalogJson = canonicalJson(parsed.catalog);
  const decodeIndex = buildDecodeIndex(parsed.catalogVersion, parsed.catalog);
  const decodeIndexJson = canonicalJson(decodeIndex);

  if (existingRows.length > 0) {
    const storedHash = String(existingRows[0].content_hash ?? existingRows[0].CONTENT_HASH ?? "");
    if (storedHash !== contentHash) {
      throw new Error(
        `menu_versions immutability violation for version ${parsed.catalogVersion}: ` +
          `stored hash ${storedHash} !== computed hash ${contentHash}`,
      );
    }
    decodeIndexCache.set(parsed.catalogVersion, decodeIndex);
    return;
  }

  await client.execute({
    sql: `INSERT INTO menu_versions (version, published_at, catalog_json, decode_index, content_hash) VALUES (?, ?, ?, ?, ?)`,
    args: [parsed.catalogVersion, publishedAtMs, catalogJson, decodeIndexJson, contentHash],
  });
  decodeIndexCache.set(parsed.catalogVersion, decodeIndex);
}

/** First-run: seed v1 from packaged `menu.json` when `menu_versions` is empty. */
export async function bootstrapMenuFromPackagedFileIfEmpty(client: Client): Promise<void> {
  const n = await menuVersionsRowCount(client);
  if (n > 0) return;
  const parsed = getPackagedMenuCatalogParsed();
  await upsertMenuVersionForPublish(client, parsed);
}

export async function fetchMenuRuntimeLatest(
  client: Client,
): Promise<{ version: number; catalog: MenuDocument; decodeIndex: DecodeIndex } | null> {
  const result = await client.execute(`
    SELECT version, catalog_json, decode_index
    FROM menu_versions
    WHERE version = (SELECT MAX(version) FROM menu_versions)
  `);
  const rows = (result.rows ?? []) as Record<string, unknown>[];
  if (rows.length === 0) return null;
  const version = Number(rows[0].version ?? rows[0].VERSION ?? 0);
  const catalog = JSON.parse(String(rows[0].catalog_json ?? rows[0].CATALOG_JSON)) as MenuDocument;
  const decodeIndex = JSON.parse(String(rows[0].decode_index ?? rows[0].DECODE_INDEX)) as DecodeIndex;
  return { version, catalog, decodeIndex };
}

/**
 * Active row’s `catalog_json` column verbatim: canonical `MenuDocument` only
 * (`restaurant`, `menuName`, `categories`), never `catalogVersion` / `publishedAt`.
 */
export async function fetchMenuRuntimeLatestCatalogJson(
  client: Client,
): Promise<{ version: number; catalogJson: string } | null> {
  const result = await client.execute(`
    SELECT version, catalog_json
    FROM menu_versions
    WHERE version = (SELECT MAX(version) FROM menu_versions)
  `);
  const rows = (result.rows ?? []) as Record<string, unknown>[];
  if (rows.length === 0) return null;
  const version = Number(rows[0].version ?? rows[0].VERSION ?? 0);
  const catalogJson = String(rows[0].catalog_json ?? rows[0].CATALOG_JSON ?? "");
  return { version, catalogJson };
}

export async function fetchMenuCatalogAndDecodeIndexByVersion(
  client: Client,
  version: number,
): Promise<{ catalog: MenuDocument; decodeIndex: DecodeIndex } | null> {
  const result = await client.execute({
    sql: `SELECT catalog_json, decode_index FROM menu_versions WHERE version = ?`,
    args: [version],
  });
  const rows = (result.rows ?? []) as Record<string, unknown>[];
  if (rows.length === 0) return null;
  const catalog = JSON.parse(String(rows[0].catalog_json ?? rows[0].CATALOG_JSON)) as MenuDocument;
  const decodeIndex = JSON.parse(String(rows[0].decode_index ?? rows[0].DECODE_INDEX)) as DecodeIndex;
  return { catalog, decodeIndex };
}
