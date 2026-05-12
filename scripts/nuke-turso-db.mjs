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

function quoteIdentifier(name) {
  return `"${name.replaceAll('"', '""')}"`;
}

try {
  const result = await db.execute(`
    SELECT name
    FROM sqlite_schema
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
    ORDER BY name;
  `);
  const tables = result.rows.map((row) => String(row.name ?? row.NAME));

  if (tables.length === 0) {
    console.log("No tables to drop.");
  } else {
    console.log(`Dropping ${tables.length} table(s): ${tables.join(", ")}`);

    const sql = [
      "PRAGMA foreign_keys = OFF;",
      ...tables.map((table) => `DROP TABLE IF EXISTS ${quoteIdentifier(table)};`),
      "PRAGMA foreign_keys = ON;",
    ].join("\n");

    await db.executeMultiple(sql);

    const check = await db.execute(`
      SELECT name
      FROM sqlite_schema
      WHERE type = 'table'
        AND name NOT LIKE 'sqlite_%'
      ORDER BY name;
    `);
    const remaining = check.rows.map((row) => String(row.name ?? row.NAME));

    if (remaining.length > 0) {
      console.error(`Tables still remain: ${remaining.join(", ")}`);
      process.exit(1);
    }

    console.log("Done. All tables dropped.");
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
} finally {
  db.close();
}
