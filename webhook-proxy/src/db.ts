import path from "node:path";
import { createClient, type Client } from "@libsql/client";

export type KitchenOrderPayload = {
  stripeEventId: string;
  paymentIntentId: string;
  amountCents: number;
  currency: string;
  lines: { id: string; quantity: number; selections: Record<string, string[]> }[];
};

export function defaultDatabaseUrl(): string {
  const dir = path.join(import.meta.dirname, "..", "data");
  return `file:${path.join(dir, "webhook-proxy.db")}`;
}

export function openDb(url: string): Client {
  return createClient({ url });
}

export async function migrate(client: Client): Promise<void> {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS kitchen_orders (
      stripe_event_id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);
}

/** Returns true if a new row was inserted (eligible for SSE broadcast). */
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
  const result = await client.execute(
    `SELECT payload FROM kitchen_orders ORDER BY created_at ASC`,
  );
  const rows = (result.rows ?? []) as Record<string, unknown>[];
  return rows.map((r) => {
    const raw = r.payload ?? r.PAYLOAD;
    return JSON.parse(String(raw)) as KitchenOrderPayload;
  });
}

export async function deletePending(client: Client, stripeEventId: string): Promise<void> {
  await client.execute({
    sql: `DELETE FROM kitchen_orders WHERE stripe_event_id = ?`,
    args: [stripeEventId],
  });
}
