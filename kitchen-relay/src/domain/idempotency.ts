import { mkdirSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient, type Client } from "@libsql/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type IdempotencyStore = {
  tryCommit(eventId: string): Promise<boolean>;
};

function defaultStorePath(): string {
  return path.join(__dirname, "..", ".kitchen-processed-events.db");
}

export function createSqliteIdempotencyStore(storePath: string): IdempotencyStore {
  mkdirSync(path.dirname(storePath), { recursive: true });
  const dbUrl = `file:${path.resolve(storePath)}`;
  const db: Client = createClient({ url: dbUrl });
  const initPromise = db.execute(`
    CREATE TABLE IF NOT EXISTS processed_events (
      event_id TEXT PRIMARY KEY,
      committed_at INTEGER NOT NULL
    );
  `);

  return {
    async tryCommit(eventId: string): Promise<boolean> {
      await initPromise;
      const result = await db.execute({
        sql: `
          INSERT OR IGNORE INTO processed_events (event_id, committed_at)
          VALUES (?, ?);
        `,
        args: [eventId, Date.now()],
      });
      return (result.rowsAffected ?? 0) > 0;
    },
  };
}

export function resolveIdempotencyStorePath(explicit?: string): string {
  if (explicit && explicit.trim()) {
    return path.resolve(explicit.trim());
  }
  return defaultStorePath();
}
