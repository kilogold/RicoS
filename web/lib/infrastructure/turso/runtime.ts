import type { Client } from "@libsql/client";
import { MENU_VERSIONS } from "@ricos/shared";
import { requiredEnv } from "@/lib/infrastructure/shared/env";
import { migrate, openDb, seedMenuVersions } from "./commerce-db";

type RuntimeState = {
  dbPromise: Promise<Client> | null;
};

const state = globalThis as typeof globalThis & { __ricosCommerceDbRuntime?: RuntimeState };

if (!state.__ricosCommerceDbRuntime) {
  state.__ricosCommerceDbRuntime = {
    dbPromise: null,
  };
}

const runtime = state.__ricosCommerceDbRuntime;

export async function getCommerceDb(): Promise<Client> {
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
