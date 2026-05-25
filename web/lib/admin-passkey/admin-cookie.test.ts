import { describe, expect, test } from "bun:test";
import { signAdminCookie, verifyAdminCookie } from "./admin-cookie";

describe("admin-cookie", () => {
  const secret = "test-staff-secret-for-hmac";

  test("sign and verify round trip", () => {
    process.env.STAFF_OPERATIONS_SECRET = secret;
    const value = signAdminCookie("cred-abc", 1_000_000);
    expect(value).not.toBeNull();
    const verified = verifyAdminCookie(value, 1_000_000);
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.credentialId).toBe("cred-abc");
    }
  });

  test("rejects tampered mac", () => {
    process.env.STAFF_OPERATIONS_SECRET = secret;
    const value = signAdminCookie("cred-abc", 1_000_000);
    expect(value).not.toBeNull();
    const tampered = `${value}x`;
    expect(verifyAdminCookie(tampered, 1_000_000).ok).toBe(false);
  });

  test("rejects expired cookie", () => {
    process.env.STAFF_OPERATIONS_SECRET = secret;
    const value = signAdminCookie("cred-abc", 1_000_000);
    expect(verifyAdminCookie(value, 1_000_000 + 13 * 60 * 60 * 1000).ok).toBe(false);
  });
});
