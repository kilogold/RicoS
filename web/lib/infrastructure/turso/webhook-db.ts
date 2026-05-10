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
import type { KitchenOrderPayload, IngressProvider } from "@/lib/commerce/domain";

export type PendingPaymentStatus = "pending" | "confirmed" | "expired";

export type PendingPaymentRecord = {
  orderReference: string;
  metadataJson: string;
  issuedAt: number;
  expiresAt: number;
  status: PendingPaymentStatus;
  signature?: string;
};

export type PurchaseOrderStatus =
  | "paid"
  | "acknowledged"
  | "fulfilled"
  | "refunding"
  | "refunded";

export type PurchaseOrderRecord = {
  orderReference: string;
  paymentProvider: IngressProvider;
  paymentIngressEventId: string;
  amountCents: number;
  currency: string;
  payload: KitchenOrderPayload;
  status: PurchaseOrderStatus;
  createdAt: number;
  updatedAt: number;
};

export type RefundRecord = {
  id: number;
  orderReference: string;
  amountCents: number;
  stripeRefundConfirmation?: string;
  solanaRefundTransactionSignature?: string;
  createdAt: number;
  confirmedAt?: number;
};

export function openDb(url: string, authToken: string): Client {
  return createClient({ url, authToken });
}

export async function migrate(client: Client): Promise<void> {
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
      order_reference TEXT PRIMARY KEY,
      metadata_json   TEXT NOT NULL,
      issued_at       INTEGER NOT NULL,
      expires_at      INTEGER NOT NULL,
      status          TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','confirmed','expired')),
      signature       TEXT
    )
  `);
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_pending_payments_status_expires_at
    ON pending_payments(status, expires_at)
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS purchase_orders (
      order_reference          TEXT NOT NULL UNIQUE,
      payment_provider         TEXT NOT NULL
                               CHECK (payment_provider IN ('stripe','helius')),
      payment_ingress_event_id TEXT,
      amount_cents             INTEGER NOT NULL,
      currency                 TEXT NOT NULL,
      payload_json             TEXT NOT NULL,
      status                   TEXT NOT NULL DEFAULT 'paid'
                               CHECK (status IN ('paid','acknowledged','fulfilled','refunding','refunded')),
      created_at               INTEGER NOT NULL,
      updated_at               INTEGER NOT NULL
    )
  `);
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_purchase_orders_status
    ON purchase_orders(status)
  `);
  // Partial unique indexes are not valid ON CONFLICT targets in SQLite/libSQL
  // (`INSERT ... ON CONFLICT(payment_ingress_event_id)`). Use a full-column UNIQUE index;
  // SQLite still allows multiple NULLs in UNIQUE columns.
  await client.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_orders_ingress_event_full
    ON purchase_orders(payment_ingress_event_id)
  `);
  await client.execute(`DROP INDEX IF EXISTS uq_purchase_orders_ingress_event`);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS refunds (
      id                                   INTEGER PRIMARY KEY AUTOINCREMENT,
      order_reference                      TEXT NOT NULL
                                            REFERENCES purchase_orders(order_reference),
      amount_cents                         INTEGER NOT NULL CHECK (amount_cents > 0),
      stripe_refund_confirmation           TEXT,
      solana_refund_transaction_signature  TEXT,
      created_at                           INTEGER NOT NULL,
      confirmed_at                         INTEGER
    )
  `);
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_refunds_order_reference
    ON refunds(order_reference)
  `);
  await client.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_refunds_stripe_confirmation
    ON refunds(stripe_refund_confirmation)
    WHERE stripe_refund_confirmation IS NOT NULL
  `);
  await client.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_refunds_solana_signature
    ON refunds(solana_refund_transaction_signature)
    WHERE solana_refund_transaction_signature IS NOT NULL
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

export async function insertPendingPaymentIfNew(
  client: Client,
  record: PendingPaymentRecord,
): Promise<boolean> {
  const result = await client.execute({
    sql: `
      INSERT OR IGNORE INTO pending_payments (
        order_reference,
        metadata_json,
        issued_at,
        expires_at,
        status,
        signature
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    args: [
      record.orderReference,
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
    orderReference: String(row.order_reference ?? row.ORDER_REFERENCE ?? ""),
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

/** Returns pending_payment rows for any of the given order_reference pubkeys (order not preserved). */
export async function getPendingPaymentsByReferences(
  client: Client,
  orderReferences: string[],
): Promise<Map<string, PendingPaymentRecord>> {
  const out = new Map<string, PendingPaymentRecord>();
  const unique = [...new Set(orderReferences.filter((r) => typeof r === "string" && r.length > 0))];
  if (unique.length === 0) return out;

  const placeholders = unique.map(() => "?").join(", ");
  const result = await client.execute({
    sql: `
      SELECT order_reference, metadata_json, issued_at, expires_at, status, signature
      FROM pending_payments
      WHERE order_reference IN (${placeholders})
    `,
    args: unique,
  });
  const rows = (result.rows ?? []) as Record<string, unknown>[];
  for (const row of rows) {
    const rec = rowToPendingPayment(row);
    out.set(rec.orderReference, rec);
  }
  return out;
}

export async function markPendingPaymentConfirmed(
  client: Client,
  orderReference: string,
  signature: string,
): Promise<void> {
  await client.execute({
    sql: `UPDATE pending_payments SET status = 'confirmed', signature = ? WHERE order_reference = ?`,
    args: [signature, orderReference],
  });
}

// ---------- purchase_orders -------------------------------------------------

function rowToPurchaseOrder(row: Record<string, unknown>): PurchaseOrderRecord {
  const payloadRaw = row.payload_json ?? row.PAYLOAD_JSON;
  const ingressEventId = row.payment_ingress_event_id ?? row.PAYMENT_INGRESS_EVENT_ID;
  return {
    orderReference: String(row.order_reference ?? row.ORDER_REFERENCE ?? ""),
    paymentProvider: String(row.payment_provider ?? row.PAYMENT_PROVIDER ?? "") as IngressProvider,
    paymentIngressEventId: ingressEventId === null || ingressEventId === undefined
      ? ""
      : String(ingressEventId),
    amountCents: Number(row.amount_cents ?? row.AMOUNT_CENTS ?? 0),
    currency: String(row.currency ?? row.CURRENCY ?? ""),
    payload: JSON.parse(String(payloadRaw)) as KitchenOrderPayload,
    status: String(row.status ?? row.STATUS ?? "paid") as PurchaseOrderStatus,
    createdAt: Number(row.created_at ?? row.CREATED_AT ?? 0),
    updatedAt: Number(row.updated_at ?? row.UPDATED_AT ?? 0),
  };
}

/**
 * Insert a new `purchase_orders` row at status `paid`.
 * Idempotent on `payment_ingress_event_id` (partial unique index).
 * Returns true when a new row was inserted, false when the ingress event was already recorded.
 */
export async function insertPurchaseOrderPaidIfNew(
  client: Client,
  params: {
    orderReference: string;
    paymentProvider: IngressProvider;
    payload: KitchenOrderPayload;
  },
): Promise<boolean> {
  const now = Date.now();
  const result = await client.execute({
    sql: `
      INSERT INTO purchase_orders (
        order_reference,
        payment_provider,
        payment_ingress_event_id,
        amount_cents,
        currency,
        payload_json,
        status,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, 'paid', ?, ?)
      ON CONFLICT(payment_ingress_event_id) DO NOTHING
    `,
    args: [
      params.orderReference,
      params.paymentProvider,
      params.payload.paymentIngressEventId,
      params.payload.amountCents,
      params.payload.currency,
      JSON.stringify(params.payload),
      now,
      now,
    ],
  });
  return (result.rowsAffected ?? 0) > 0;
}

/**
 * Atomic Solana ingress: insert `purchase_orders (paid)` and confirm `pending_payments`
 * in a single transaction. Returns true when the purchase row was newly inserted.
 */
export async function persistSolanaPaidPurchaseOrderAtomic(
  client: Client,
  params: {
    orderReference: string;
    transactionSignature: string;
    payload: KitchenOrderPayload;
  },
): Promise<boolean> {
  const now = Date.now();
  const results = await client.batch(
    [
      {
        sql: `
          INSERT INTO purchase_orders (
            order_reference,
            payment_provider,
            payment_ingress_event_id,
            amount_cents,
            currency,
            payload_json,
            status,
            created_at,
            updated_at
          )
          VALUES (?, 'helius', ?, ?, ?, ?, 'paid', ?, ?)
          ON CONFLICT(payment_ingress_event_id) DO NOTHING
        `,
        args: [
          params.orderReference,
          params.payload.paymentIngressEventId,
          params.payload.amountCents,
          params.payload.currency,
          JSON.stringify(params.payload),
          now,
          now,
        ],
      },
      {
        sql: `UPDATE pending_payments SET status = 'confirmed', signature = ? WHERE order_reference = ?`,
        args: [params.transactionSignature, params.orderReference],
      },
    ],
    "write",
  );
  return (results[0]?.rowsAffected ?? 0) > 0;
}

/** Kitchen queue: every `purchase_orders` row still in `paid` (not yet acknowledged). */
export async function listPaidPurchaseOrdersForKitchen(
  client: Client,
): Promise<KitchenOrderPayload[]> {
  const result = await client.execute(`
    SELECT payload_json
    FROM purchase_orders
    WHERE status = 'paid'
    ORDER BY created_at ASC
  `);
  const rows = (result.rows ?? []) as Record<string, unknown>[];
  return rows.map((row) => {
    const raw = row.payload_json ?? row.PAYLOAD_JSON;
    return JSON.parse(String(raw)) as KitchenOrderPayload;
  });
}

/**
 * Print-ack transition: `paid` → `acknowledged` keyed by ingress event id.
 * Returns true when a row was updated (false when no `paid` row matched, e.g. duplicate ack).
 */
export async function markPurchaseOrderAcknowledged(
  client: Client,
  paymentIngressEventId: string,
): Promise<boolean> {
  const result = await client.execute({
    sql: `
      UPDATE purchase_orders
      SET status = 'acknowledged', updated_at = ?
      WHERE payment_ingress_event_id = ? AND status = 'paid'
    `,
    args: [Date.now(), paymentIngressEventId],
  });
  return (result.rowsAffected ?? 0) > 0;
}

/**
 * Staff fulfillment: `acknowledged` → `fulfilled` only (ticket printed first).
 */
export async function markPurchaseOrderFulfilled(
  client: Client,
  orderReference: string,
): Promise<boolean> {
  const result = await client.execute({
    sql: `
      UPDATE purchase_orders
      SET status = 'fulfilled', updated_at = ?
      WHERE order_reference = ?
        AND status = 'acknowledged'
    `,
    args: [Date.now(), orderReference],
  });
  return (result.rowsAffected ?? 0) > 0;
}

export async function getPurchaseOrderByReference(
  client: Client,
  orderReference: string,
): Promise<PurchaseOrderRecord | null> {
  const result = await client.execute({
    sql: `
      SELECT order_reference, payment_provider, payment_ingress_event_id, amount_cents,
             currency, payload_json, status, created_at, updated_at
      FROM purchase_orders
      WHERE order_reference = ?
    `,
    args: [orderReference],
  });
  const rows = (result.rows ?? []) as Record<string, unknown>[];
  if (rows.length === 0) return null;
  return rowToPurchaseOrder(rows[0]);
}

/** Inclusive `created_at` range: `[fromMs, toMs]`. */
export async function listPurchaseOrdersCreatedBetween(
  client: Client,
  fromMs: number,
  toMs: number,
): Promise<PurchaseOrderRecord[]> {
  const result = await client.execute({
    sql: `
      SELECT order_reference, payment_provider, payment_ingress_event_id, amount_cents,
             currency, payload_json, status, created_at, updated_at
      FROM purchase_orders
      WHERE created_at >= ? AND created_at <= ?
      ORDER BY created_at DESC
    `,
    args: [fromMs, toMs],
  });
  const rows = (result.rows ?? []) as Record<string, unknown>[];
  return rows.map((row) => rowToPurchaseOrder(row));
}

export async function setPurchaseOrderStatus(
  client: Client,
  orderReference: string,
  status: PurchaseOrderStatus,
): Promise<void> {
  await client.execute({
    sql: `UPDATE purchase_orders SET status = ?, updated_at = ? WHERE order_reference = ?`,
    args: [status, Date.now(), orderReference],
  });
}

// ---------- refunds ---------------------------------------------------------

function rowToRefund(row: Record<string, unknown>): RefundRecord {
  const stripe = row.stripe_refund_confirmation ?? row.STRIPE_REFUND_CONFIRMATION;
  const sol = row.solana_refund_transaction_signature ?? row.SOLANA_REFUND_TRANSACTION_SIGNATURE;
  const confirmed = row.confirmed_at ?? row.CONFIRMED_AT;
  return {
    id: Number(row.id ?? row.ID ?? 0),
    orderReference: String(row.order_reference ?? row.ORDER_REFERENCE ?? ""),
    amountCents: Number(row.amount_cents ?? row.AMOUNT_CENTS ?? 0),
    stripeRefundConfirmation: stripe === null || stripe === undefined ? undefined : String(stripe),
    solanaRefundTransactionSignature:
      sol === null || sol === undefined ? undefined : String(sol),
    createdAt: Number(row.created_at ?? row.CREATED_AT ?? 0),
    confirmedAt: confirmed === null || confirmed === undefined ? undefined : Number(confirmed),
  };
}

/**
 * Atomically insert a refund row only if it would not push the order over its total.
 * The guard sums **all** refund rows for the order — including proof-null reservations
 * — so concurrent reservations cannot collectively overdraw. (Distinct from
 * `sumConfirmedRefundsForOrder`, which excludes proof-null rows for the
 * `refunding` → `refunded` transition per plan P0 §2.)
 *
 * Returns the inserted `RefundRecord`, or `null` when the insert was rejected
 * (overdraw or unknown order). Single SQL statement → SQLite/libSQL serializes
 * concurrent writers, so the read-then-insert is atomic without an explicit txn.
 */
export async function tryInsertRefundIfWithinOrderTotal(
  client: Client,
  params: {
    orderReference: string;
    amountCents: number;
    stripeRefundConfirmation?: string;
    solanaRefundTransactionSignature?: string;
  },
): Promise<RefundRecord | null> {
  const now = Date.now();
  const proofPresent =
    !!params.stripeRefundConfirmation || !!params.solanaRefundTransactionSignature;
  const result = await client.execute({
    sql: `
      INSERT INTO refunds (
        order_reference,
        amount_cents,
        stripe_refund_confirmation,
        solana_refund_transaction_signature,
        created_at,
        confirmed_at
      )
      SELECT ?, ?, ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM purchase_orders po
        WHERE po.order_reference = ?
          AND po.amount_cents >= ? + COALESCE((
            SELECT SUM(r.amount_cents) FROM refunds r
            WHERE r.order_reference = ?
          ), 0)
      )
      RETURNING id, order_reference, amount_cents, stripe_refund_confirmation,
                solana_refund_transaction_signature, created_at, confirmed_at
    `,
    args: [
      params.orderReference,
      params.amountCents,
      params.stripeRefundConfirmation ?? null,
      params.solanaRefundTransactionSignature ?? null,
      now,
      proofPresent ? now : null,
      params.orderReference,
      params.amountCents,
      params.orderReference,
    ],
  });
  const rows = (result.rows ?? []) as Record<string, unknown>[];
  if (rows.length === 0) return null;
  return rowToRefund(rows[0]);
}

/** Roll back a proof-null reservation (e.g. when the Stripe refund call fails). */
export async function deleteRefund(client: Client, refundId: number): Promise<void> {
  await client.execute({
    sql: `DELETE FROM refunds WHERE id = ?`,
    args: [refundId],
  });
}

/** Insert a refund row. Pass rail proof at insert time when available; otherwise leave nullable. */
export async function insertRefund(
  client: Client,
  params: {
    orderReference: string;
    amountCents: number;
    stripeRefundConfirmation?: string;
    solanaRefundTransactionSignature?: string;
  },
): Promise<RefundRecord> {
  const now = Date.now();
  const proofPresent =
    !!params.stripeRefundConfirmation || !!params.solanaRefundTransactionSignature;
  const result = await client.execute({
    sql: `
      INSERT INTO refunds (
        order_reference,
        amount_cents,
        stripe_refund_confirmation,
        solana_refund_transaction_signature,
        created_at,
        confirmed_at
      )
      VALUES (?, ?, ?, ?, ?, ?)
      RETURNING id, order_reference, amount_cents, stripe_refund_confirmation,
                solana_refund_transaction_signature, created_at, confirmed_at
    `,
    args: [
      params.orderReference,
      params.amountCents,
      params.stripeRefundConfirmation ?? null,
      params.solanaRefundTransactionSignature ?? null,
      now,
      proofPresent ? now : null,
    ],
  });
  const rows = (result.rows ?? []) as Record<string, unknown>[];
  return rowToRefund(rows[0]);
}

export async function updateRefundConfirmation(
  client: Client,
  refundId: number,
  proof: { stripeRefundConfirmation?: string; solanaRefundTransactionSignature?: string },
): Promise<void> {
  if (!proof.stripeRefundConfirmation && !proof.solanaRefundTransactionSignature) {
    throw new Error("updateRefundConfirmation: at least one rail proof required");
  }
  await client.execute({
    sql: `
      UPDATE refunds
      SET stripe_refund_confirmation = COALESCE(?, stripe_refund_confirmation),
          solana_refund_transaction_signature = COALESCE(?, solana_refund_transaction_signature),
          confirmed_at = COALESCE(confirmed_at, ?)
      WHERE id = ?
    `,
    args: [
      proof.stripeRefundConfirmation ?? null,
      proof.solanaRefundTransactionSignature ?? null,
      Date.now(),
      refundId,
    ],
  });
}

/** Sum of confirmed refund amounts (rows with at least one rail proof). */
export async function sumConfirmedRefundsForOrder(
  client: Client,
  orderReference: string,
): Promise<number> {
  const result = await client.execute({
    sql: `
      SELECT COALESCE(SUM(amount_cents), 0) AS total
      FROM refunds
      WHERE order_reference = ?
        AND (stripe_refund_confirmation IS NOT NULL
             OR solana_refund_transaction_signature IS NOT NULL)
    `,
    args: [orderReference],
  });
  const rows = (result.rows ?? []) as Record<string, unknown>[];
  return Number(rows[0]?.total ?? rows[0]?.TOTAL ?? 0);
}

export async function listRefundsForOrder(
  client: Client,
  orderReference: string,
): Promise<RefundRecord[]> {
  const result = await client.execute({
    sql: `
      SELECT id, order_reference, amount_cents, stripe_refund_confirmation,
             solana_refund_transaction_signature, created_at, confirmed_at
      FROM refunds
      WHERE order_reference = ?
      ORDER BY created_at ASC
    `,
    args: [orderReference],
  });
  const rows = (result.rows ?? []) as Record<string, unknown>[];
  return rows.map(rowToRefund);
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
