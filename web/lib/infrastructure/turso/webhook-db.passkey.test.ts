import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  countAdminPasskeys,
  deleteExpiredPasskeyChallenges,
  getPasskeyChallenge,
  insertPasskeyChallenge,
  migrate,
} from "./webhook-db";

describe("webhook-db admin passkeys", () => {
  let db: Client;

  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await migrate(db);
  });

  afterEach(async () => {
    db.close();
  });

  test("insert and load action challenge", async () => {
    const expiresAt = Date.now() + 60_000;
    await insertPasskeyChallenge(db, {
      challenge: "ch_test_1",
      type: "action",
      actionName: "refund",
      payloadHash: "abc123",
      expiresAt,
    });
    const loaded = await getPasskeyChallenge(db, "ch_test_1");
    expect(loaded).not.toBeNull();
    expect(loaded?.actionName).toBe("refund");
    expect(loaded?.payloadHash).toBe("abc123");
    expect(loaded?.type).toBe("action");
  });

  test("deleteExpiredPasskeyChallenges removes stale rows", async () => {
    await insertPasskeyChallenge(db, {
      challenge: "old",
      type: "register",
      expiresAt: Date.now() - 1,
    });
    await insertPasskeyChallenge(db, {
      challenge: "new",
      type: "register",
      expiresAt: Date.now() + 60_000,
    });
    await deleteExpiredPasskeyChallenges(db);
    expect(await getPasskeyChallenge(db, "old")).toBeNull();
    expect(await getPasskeyChallenge(db, "new")).not.toBeNull();
  });

  test("countAdminPasskeys starts at zero", async () => {
    expect(await countAdminPasskeys(db)).toBe(0);
  });
});
