import type { Client } from "@libsql/client";
import { MENU_VERSIONS } from "@ricos/shared";
import { requiredEnv } from "@/lib/shared/config/server-env";
import { migrate, openDb, seedMenuVersions } from "./webhook-db";

type WebhookDbRuntimeState = {
  dbPromise: Promise<Client> | null;
};

const state = globalThis as typeof globalThis & {
  __ricosWebhookDbRuntime?: WebhookDbRuntimeState;
};

if (!state.__ricosWebhookDbRuntime) {
  state.__ricosWebhookDbRuntime = { dbPromise: null };
}

const runtime = state.__ricosWebhookDbRuntime;

export async function getWebhookDb(): Promise<Client> {
  if (runtime.dbPromise) return runtime.dbPromise;

  runtime.dbPromise = (async () => {
    const databaseUrl = requiredEnv("WEBHOOK_PROXY_DATABASE_URL");
    const databaseAuthToken = requiredEnv("WEBHOOK_PROXY_DATABASE_AUTH_TOKEN");

    if (!databaseUrl.startsWith("libsql://") && !databaseUrl.startsWith("https://")) {
      throw new Error(
        "WEBHOOK_PROXY_DATABASE_URL must be a Turso remote URL (libsql://... or https://...)",
      );
    }

    const db = openDb(databaseUrl, databaseAuthToken);
    await migrate(db);
    await seedMenuVersions(db, MENU_VERSIONS);
    return db;
  })();

  return runtime.dbPromise;
}
