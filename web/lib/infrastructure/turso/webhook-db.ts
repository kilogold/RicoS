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

export type PurchaseOrderStatus =
  | "pending"
  | "expired"
  | "paid"
  | "acknowledged"
  | "fulfilled"
  | "refunding"
  | "refunded";

type PersistedOrderPayload = KitchenOrderPayload & {
  metadata?: Record<string, string | undefined>;
};

export type PurchaseOrderRecord = {
  orderReference: string;
  paymentProvider: IngressProvider;
  paymentIngressEventId: string | null;
  paymentIntentExpiresAt: number | null;
  amountCents: number;
  currency: string;
  payload: KitchenOrderPayload;
  status: PurchaseOrderStatus;
  statusId: number | null;
  createdAt: number;
  updatedAt: number;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
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
    CREATE TABLE IF NOT EXISTS purchase_orders (
      order_reference          TEXT PRIMARY KEY,
      payment_provider         TEXT NOT NULL
                               CHECK (payment_provider IN ('stripe','helius')),
      payment_ingress_event_id TEXT UNIQUE,
      payment_intent_expires_at INTEGER,
      amount_cents             INTEGER NOT NULL,
      currency                 TEXT NOT NULL,
      payload_json             TEXT NOT NULL,
      status_id                INTEGER,
      created_at               INTEGER NOT NULL,
      customer_name            TEXT NOT NULL,
      customer_phone           TEXT NOT NULL,
      customer_email           TEXT,
      FOREIGN KEY (order_reference, status_id)
        REFERENCES status_history(order_reference, status_id)
    )
  `);
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_purchase_orders_current_status
    ON purchase_orders(status_id)
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS status_history (
      status_id       INTEGER NOT NULL,
      order_reference TEXT NOT NULL
                      REFERENCES purchase_orders(order_reference),
      status          TEXT NOT NULL
                      CHECK (status IN ('pending','expired','paid','acknowledged','fulfilled','refunding','refunded')),
      updated_at      INTEGER NOT NULL,
      PRIMARY KEY (order_reference, status_id)
    )
  `);
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_status_history_order_reference_updated_at
    ON status_history(order_reference, updated_at)
  `);
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_status_history_status_updated_at
    ON status_history(status, updated_at)
  `);

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
}

async function appendOrderStatus(
  client: Client,
  orderReference: string,
  status: PurchaseOrderStatus,
  updatedAt = Date.now(),
): Promise<number> {
  const result = await client.execute({
    sql: `
      INSERT INTO status_history (order_reference, status_id, status, updated_at)
      SELECT ?, COALESCE(MAX(status_id), 0) + 1, ?, ?
      FROM status_history
      WHERE order_reference = ?
      RETURNING status_id
    `,
    args: [orderReference, status, updatedAt, orderReference],
  });
  const rows = (result.rows ?? []) as Record<string, unknown>[];
  return Number(rows[0]?.status_id ?? rows[0]?.STATUS_ID ?? 0);
}

async function pointOrderAtStatus(
  client: Client,
  orderReference: string,
  statusId: number,
): Promise<void> {
  await client.execute({
    sql: `UPDATE purchase_orders SET status_id = ? WHERE order_reference = ?`,
    args: [statusId, orderReference],
  });
}

async function transitionOrderStatus(
  client: Client,
  orderReference: string,
  status: PurchaseOrderStatus,
  updatedAt = Date.now(),
): Promise<number> {
  const statusId = await appendOrderStatus(client, orderReference, status, updatedAt);
  await pointOrderAtStatus(client, orderReference, statusId);
  return statusId;
}

export async function insertPendingPurchaseOrderIfNew(
  client: Client,
  params: {
    orderReference: string;
    paymentProvider: IngressProvider;
    paymentIntentExpiresAt?: number | null;
    amountCents: number;
    currency: string;
    payload: KitchenOrderPayload;
    metadata?: Record<string, string | undefined>;
    customerName: string;
    customerPhone: string;
    customerEmail: string | null;
  },
): Promise<boolean> {
  const now = Date.now();
  const payload: PersistedOrderPayload = {
    ...params.payload,
    ...(params.metadata ? { metadata: params.metadata } : {}),
  };
  const result = await client.execute({
    sql: `
      INSERT OR IGNORE INTO purchase_orders (
        order_reference,
        payment_provider,
        payment_ingress_event_id,
        payment_intent_expires_at,
        amount_cents,
        currency,
        payload_json,
        status_id,
        created_at,
        customer_name,
        customer_phone,
        customer_email
      )
      VALUES (?, ?, NULL, ?, ?, ?, ?, NULL, ?, ?, ?, ?)
    `,
    args: [
      params.orderReference,
      params.paymentProvider,
      params.paymentIntentExpiresAt ?? null,
      params.amountCents,
      params.currency,
      JSON.stringify(payload),
      now,
      params.customerName,
      params.customerPhone,
      params.customerEmail,
    ],
  });
  const inserted = (result.rowsAffected ?? 0) > 0;
  if (inserted) {
    await transitionOrderStatus(client, params.orderReference, "pending", now);
  }
  return inserted;
}

export async function getPurchaseOrdersByReferences(
  client: Client,
  orderReferences: string[],
): Promise<Map<string, PurchaseOrderRecord>> {
  const out = new Map<string, PurchaseOrderRecord>();
  const unique = [...new Set(orderReferences.filter((r) => typeof r === "string" && r.length > 0))];
  if (unique.length === 0) return out;

  const placeholders = unique.map(() => "?").join(", ");
  const result = await client.execute({
    sql: `
      SELECT po.order_reference, po.payment_provider, po.payment_ingress_event_id,
             po.payment_intent_expires_at, po.amount_cents, po.currency, po.payload_json,
             po.status_id, sh.status, po.created_at, sh.updated_at,
             po.customer_name, po.customer_phone, po.customer_email
      FROM purchase_orders po
      LEFT JOIN status_history sh
        ON sh.order_reference = po.order_reference
       AND sh.status_id = po.status_id
      WHERE po.order_reference IN (${placeholders})
    `,
    args: unique,
  });
  const rows = (result.rows ?? []) as Record<string, unknown>[];
  for (const row of rows) {
    const rec = rowToPurchaseOrder(row);
    out.set(rec.orderReference, rec);
  }
  return out;
}

export function getPendingPurchaseOrderMetadata(
  order: PurchaseOrderRecord,
): Record<string, string | undefined> | null {
  const payload = order.payload as PersistedOrderPayload;
  return payload.metadata && typeof payload.metadata === "object" ? payload.metadata : null;
}

// ---------- purchase_orders -------------------------------------------------

function rowToPurchaseOrder(row: Record<string, unknown>): PurchaseOrderRecord {
  const payloadRaw = row.payload_json ?? row.PAYLOAD_JSON;
  const ingressEventId = row.payment_ingress_event_id ?? row.PAYMENT_INGRESS_EVENT_ID;
  const expiresAt = row.payment_intent_expires_at ?? row.PAYMENT_INTENT_EXPIRES_AT;
  const statusId = row.status_id ?? row.STATUS_ID;
  const updatedAt = row.updated_at ?? row.UPDATED_AT;
  const customerEmail = row.customer_email ?? row.CUSTOMER_EMAIL;
  return {
    orderReference: String(row.order_reference ?? row.ORDER_REFERENCE ?? ""),
    paymentProvider: String(row.payment_provider ?? row.PAYMENT_PROVIDER ?? "") as IngressProvider,
    paymentIngressEventId: ingressEventId === null || ingressEventId === undefined
      ? null
      : String(ingressEventId),
    paymentIntentExpiresAt:
      expiresAt === null || expiresAt === undefined ? null : Number(expiresAt),
    amountCents: Number(row.amount_cents ?? row.AMOUNT_CENTS ?? 0),
    currency: String(row.currency ?? row.CURRENCY ?? ""),
    payload: JSON.parse(String(payloadRaw)) as KitchenOrderPayload,
    status: String(row.status ?? row.STATUS ?? "pending") as PurchaseOrderStatus,
    statusId: statusId === null || statusId === undefined ? null : Number(statusId),
    createdAt: Number(row.created_at ?? row.CREATED_AT ?? 0),
    updatedAt: updatedAt === null || updatedAt === undefined ? 0 : Number(updatedAt),
    customerName: String(row.customer_name ?? row.CUSTOMER_NAME ?? ""),
    customerPhone: String(row.customer_phone ?? row.CUSTOMER_PHONE ?? ""),
    customerEmail: customerEmail === null || customerEmail === undefined ? null : String(customerEmail),
  };
}

/**
 * Mark a pending Stripe order as paid. Idempotent on `payment_ingress_event_id`.
 */
export async function markStripePurchaseOrderPaidIfNew(
  client: Client,
  params: {
    orderReference: string;
    payload: KitchenOrderPayload;
  },
): Promise<boolean> {
  const existing = await client.execute({
    sql: `
      SELECT po.order_reference, po.payment_ingress_event_id, sh.status
      FROM purchase_orders po
      LEFT JOIN status_history sh
        ON sh.order_reference = po.order_reference
       AND sh.status_id = po.status_id
      WHERE po.order_reference = ?
    `,
    args: [params.orderReference],
  });
  const rows = (existing.rows ?? []) as Record<string, unknown>[];
  if (rows.length === 0) {
    throw new Error(`missing pending Stripe purchase order ${params.orderReference}`);
  }
  const currentIngress = rows[0].payment_ingress_event_id ?? rows[0].PAYMENT_INGRESS_EVENT_ID;
  if (currentIngress === params.payload.paymentIngressEventId) {
    return false;
  }
  const currentStatus = String(rows[0].status ?? rows[0].STATUS ?? "pending");
  if (currentStatus !== "pending") {
    return false;
  }

  const update = await client.execute({
    sql: `
      UPDATE purchase_orders
      SET payment_ingress_event_id = ?,
          amount_cents = ?,
          currency = ?,
          payload_json = ?
      WHERE order_reference = ?
        AND payment_provider = 'stripe'
        AND payment_ingress_event_id IS NULL
    `,
    args: [
      params.payload.paymentIngressEventId,
      params.payload.amountCents,
      params.payload.currency,
      JSON.stringify(params.payload),
      params.orderReference,
    ],
  });
  if ((update.rowsAffected ?? 0) === 0) {
    return false;
  }
  await transitionOrderStatus(client, params.orderReference, "paid");
  return true;
}

/**
 * Solana ingress: move a pending purchase order to paid and attach the landed tx event id.
 * Returns true when this webhook moved the row to paid.
 */
export async function markSolanaPurchaseOrderPaidIfNew(
  client: Client,
  params: {
    orderReference: string;
    payload: KitchenOrderPayload;
  },
): Promise<boolean> {
  const existing = await client.execute({
    sql: `
      SELECT po.payment_ingress_event_id, sh.status
      FROM purchase_orders po
      LEFT JOIN status_history sh
        ON sh.order_reference = po.order_reference
       AND sh.status_id = po.status_id
      WHERE po.order_reference = ?
    `,
    args: [params.orderReference],
  });
  const rows = (existing.rows ?? []) as Record<string, unknown>[];
  if (rows.length === 0) {
    throw new Error(`missing pending Solana purchase order ${params.orderReference}`);
  }
  const currentIngress = rows[0].payment_ingress_event_id ?? rows[0].PAYMENT_INGRESS_EVENT_ID;
  if (currentIngress === params.payload.paymentIngressEventId) {
    return false;
  }
  const currentStatus = String(rows[0].status ?? rows[0].STATUS ?? "pending");
  if (currentStatus !== "pending") {
    return false;
  }

  const update = await client.execute({
    sql: `
      UPDATE purchase_orders
      SET payment_ingress_event_id = ?,
          amount_cents = ?,
          currency = ?,
          payload_json = ?
      WHERE order_reference = ?
        AND payment_provider = 'helius'
        AND payment_ingress_event_id IS NULL
    `,
    args: [
      params.payload.paymentIngressEventId,
      params.payload.amountCents,
      params.payload.currency,
      JSON.stringify(params.payload),
      params.orderReference,
    ],
  });
  if ((update.rowsAffected ?? 0) === 0) {
    return false;
  }
  await transitionOrderStatus(client, params.orderReference, "paid");
  return true;
}

/** Kitchen queue: every `purchase_orders` row still in `paid` (not yet acknowledged). */
export async function listPaidPurchaseOrdersForKitchen(
  client: Client,
): Promise<KitchenOrderPayload[]> {
  const result = await client.execute(`
    SELECT po.payload_json, po.customer_name
    FROM purchase_orders po
    JOIN status_history sh
      ON sh.order_reference = po.order_reference
     AND sh.status_id = po.status_id
    WHERE sh.status = 'paid'
    ORDER BY po.created_at ASC
  `);
  const rows = (result.rows ?? []) as Record<string, unknown>[];
  return rows.map((row) => {
    const raw = row.payload_json ?? row.PAYLOAD_JSON;
    const parsed = JSON.parse(String(raw)) as KitchenOrderPayload;
    const fromDb = String(row.customer_name ?? row.CUSTOMER_NAME ?? "").trim();
    if (!fromDb) {
      throw new Error("Missing customer_name for paid purchase order");
    }
    return { ...parsed, customerName: fromDb, intent: "paid" };
  });
}

/**
 * Print-ack transition: `paid` → `acknowledged` keyed by ingress event id.
 * Idempotent: duplicate acks for an already-acknowledged order return true without a new transition.
 */
export async function markPurchaseOrderAcknowledged(
  client: Client,
  paymentIngressEventId: string,
): Promise<boolean> {
  const current = await client.execute({
    sql: `
      SELECT po.order_reference, sh.status
      FROM purchase_orders po
      JOIN status_history sh
        ON sh.order_reference = po.order_reference
       AND sh.status_id = po.status_id
      WHERE po.payment_ingress_event_id = ?
    `,
    args: [paymentIngressEventId],
  });
  const rows = (current.rows ?? []) as Record<string, unknown>[];
  if (rows.length === 0) {
    return false;
  }
  const orderReference = String(rows[0].order_reference ?? rows[0].ORDER_REFERENCE);
  const status = String(rows[0].status ?? rows[0].STATUS);
  if (status === "acknowledged" || status === "fulfilled") {
    return true;
  }
  if (status !== "paid") {
    return false;
  }
  await transitionOrderStatus(client, orderReference, "acknowledged");
  return true;
}

/**
 * Staff fulfillment: `acknowledged` → `fulfilled` only (ticket printed first).
 */
export async function markPurchaseOrderFulfilled(
  client: Client,
  orderReference: string,
): Promise<boolean> {
  const current = await getPurchaseOrderByReference(client, orderReference);
  if (!current || current.status !== "acknowledged") {
    return false;
  }
  await transitionOrderStatus(client, orderReference, "fulfilled");
  return true;
}

export async function markPurchaseOrderExpired(
  client: Client,
  orderReference: string,
): Promise<boolean> {
  const current = await getPurchaseOrderByReference(client, orderReference);
  if (!current || current.status !== "pending") {
    return false;
  }
  await transitionOrderStatus(client, orderReference, "expired");
  return true;
}

export async function getPurchaseOrderByIngressEventId(
  client: Client,
  paymentIngressEventId: string,
): Promise<PurchaseOrderRecord | null> {
  const result = await client.execute({
    sql: `
      SELECT po.order_reference, po.payment_provider, po.payment_ingress_event_id,
             po.payment_intent_expires_at, po.amount_cents, po.currency, po.payload_json,
             po.status_id, sh.status, po.created_at, sh.updated_at,
             po.customer_name, po.customer_phone, po.customer_email
      FROM purchase_orders po
      LEFT JOIN status_history sh
        ON sh.order_reference = po.order_reference
       AND sh.status_id = po.status_id
      WHERE po.payment_ingress_event_id = ?
    `,
    args: [paymentIngressEventId],
  });
  const rows = (result.rows ?? []) as Record<string, unknown>[];
  if (rows.length === 0) return null;
  return rowToPurchaseOrder(rows[0]);
}

export async function getPurchaseOrderByReference(
  client: Client,
  orderReference: string,
): Promise<PurchaseOrderRecord | null> {
  const result = await client.execute({
    sql: `
      SELECT po.order_reference, po.payment_provider, po.payment_ingress_event_id,
             po.payment_intent_expires_at, po.amount_cents, po.currency, po.payload_json,
             po.status_id, sh.status, po.created_at, sh.updated_at,
             po.customer_name, po.customer_phone, po.customer_email
      FROM purchase_orders po
      LEFT JOIN status_history sh
        ON sh.order_reference = po.order_reference
       AND sh.status_id = po.status_id
      WHERE po.order_reference = ?
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
      SELECT po.order_reference, po.payment_provider, po.payment_ingress_event_id,
             po.payment_intent_expires_at, po.amount_cents, po.currency, po.payload_json,
             po.status_id, sh.status, po.created_at, sh.updated_at,
             po.customer_name, po.customer_phone, po.customer_email
      FROM purchase_orders po
      LEFT JOIN status_history sh
        ON sh.order_reference = po.order_reference
       AND sh.status_id = po.status_id
      WHERE po.created_at >= ? AND po.created_at <= ?
      ORDER BY po.created_at DESC
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
  await transitionOrderStatus(client, orderReference, status);
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

/** Batched refund rows for many orders; each key is an `order_reference`. */
export async function listRefundsForOrders(
  client: Client,
  orderReferences: string[],
): Promise<Map<string, RefundRecord[]>> {
  if (orderReferences.length === 0) {
    return new Map();
  }
  const placeholders = orderReferences.map(() => "?").join(", ");
  const result = await client.execute({
    sql: `
      SELECT id, order_reference, amount_cents, stripe_refund_confirmation,
             solana_refund_transaction_signature, created_at, confirmed_at
      FROM refunds
      WHERE order_reference IN (${placeholders})
      ORDER BY order_reference ASC, created_at ASC
    `,
    args: orderReferences,
  });
  const rows = (result.rows ?? []) as Record<string, unknown>[];
  const byOrder = new Map<string, RefundRecord[]>();
  for (const row of rows) {
    const rec = rowToRefund(row);
    const list = byOrder.get(rec.orderReference) ?? [];
    list.push(rec);
    byOrder.set(rec.orderReference, list);
  }
  return byOrder;
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
