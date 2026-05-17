#!/usr/bin/env bun

import { createClient } from "@libsql/client";

const databaseUrl = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_DATABASE_AUTH_TOKEN;

if (!databaseUrl) {
  console.error("Missing TURSO_DATABASE_URL");
  process.exit(1);
}
if (!authToken) {
  console.error("Missing TURSO_DATABASE_AUTH_TOKEN");
  process.exit(1);
}

const db = createClient({ url: databaseUrl, authToken });

/** Order-domain tables; refunds first (FK → purchase_orders). */
const CLEAR_TABLES = ["refunds", "purchase_orders", "status_history"];

async function countRows(table) {
  const result = await db.execute(`SELECT COUNT(*) AS n FROM ${table}`);
  const row = result.rows[0];
  return Number(row?.n ?? row?.N ?? 0);
}

try {
  const before = Object.fromEntries(
    await Promise.all(CLEAR_TABLES.map(async (table) => [table, await countRows(table)])),
  );
  const totalBefore = Object.values(before).reduce((sum, n) => sum + n, 0);

  if (totalBefore === 0) {
    console.log("No order rows to clear.");
    process.exit(0);
  }

  console.log("Rows before clear:");
  for (const table of CLEAR_TABLES) {
    console.log(`  ${table}: ${before[table]}`);
  }

  const sql = [
    "PRAGMA foreign_keys = OFF;",
    ...CLEAR_TABLES.map((table) => `DELETE FROM ${table};`),
    "PRAGMA foreign_keys = ON;",
  ].join("\n");

  await db.executeMultiple(sql);

  const after = Object.fromEntries(
    await Promise.all(CLEAR_TABLES.map(async (table) => [table, await countRows(table)])),
  );
  const remaining = CLEAR_TABLES.filter((table) => after[table] > 0);

  if (remaining.length > 0) {
    console.error("Clear incomplete. Remaining rows:");
    for (const table of remaining) {
      console.error(`  ${table}: ${after[table]}`);
    }
    process.exit(1);
  }

  console.log("Done. Cleared purchase_orders, status_history, and refunds.");
  console.log("(menu_versions untouched)");
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
} finally {
  db.close();
}
