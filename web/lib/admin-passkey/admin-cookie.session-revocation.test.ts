process.env.ADMIN_SESSION_SIGNING_SECRET = "test-admin-session-secret";

import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { signAdminCookie, verifyAdminSession } from "@/lib/admin-passkey/admin-cookie";
import { insertPasskey, migrate } from "@/lib/infrastructure/turso/webhook-db";

// Injects this test's in-memory db into the getWebhookDb() singleton, the
// same way verify-solana-order-confirmation.test.ts does. Deliberately not
// mock.module: that replaces the module for the rest of the bun test
// process, breaking any other file that relies on the real getWebhookDb()
// afterward. Must mutate the existing state object's `dbPromise` field
// in place — webhook-db-runtime.ts caches a reference to that object at
// import time, so replacing `globalThis.__ricosWebhookDbRuntime` wholesale
// would not be visible to it.
type WebhookDbRuntimeState = { dbPromise: Promise<Client> | null };
function runtimeState(): typeof globalThis & { __ricosWebhookDbRuntime?: WebhookDbRuntimeState } {
  return globalThis as typeof globalThis & { __ricosWebhookDbRuntime?: WebhookDbRuntimeState };
}

describe("verifyAdminSession", () => {
  let db: Client;

  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await migrate(db);
    const state = runtimeState();
    if (!state.__ricosWebhookDbRuntime) {
      state.__ricosWebhookDbRuntime = { dbPromise: null };
    }
    state.__ricosWebhookDbRuntime.dbPromise = Promise.resolve(db);
  });

  afterEach(() => {
    const state = runtimeState();
    if (state.__ricosWebhookDbRuntime) {
      state.__ricosWebhookDbRuntime.dbPromise = null;
    }
    db.close();
  });

  test("accepts a session cookie whose credential still exists", async () => {
    await insertPasskey(db, { credentialId: "cred-live", publicKey: "unused", counter: 0 });
    const cookie = signAdminCookie("cred-live");
    expect(cookie).not.toBeNull();

    const result = await verifyAdminSession(cookie);
    expect(result.ok).toBe(true);
  });

  // Passkey removal is a hand-edit-the-DB, all-or-nothing operation with no
  // supported partial delete (see admin_passkeys docs) — this simulates that
  // by deleting the row directly, the same way an operator would.
  test("rejects a session cookie after its credential is deleted", async () => {
    await insertPasskey(db, { credentialId: "cred-revoked", publicKey: "unused", counter: 0 });
    const cookie = signAdminCookie("cred-revoked");
    expect(cookie).not.toBeNull();

    expect((await verifyAdminSession(cookie)).ok).toBe(true);

    await db.execute({
      sql: `DELETE FROM admin_passkeys WHERE credential_id = ?`,
      args: ["cred-revoked"],
    });

    expect((await verifyAdminSession(cookie)).ok).toBe(false);
  });

  test("rejects an unknown credential id even with a validly signed cookie", async () => {
    const cookie = signAdminCookie("cred-never-existed");
    expect(cookie).not.toBeNull();
    expect((await verifyAdminSession(cookie)).ok).toBe(false);
  });
});
