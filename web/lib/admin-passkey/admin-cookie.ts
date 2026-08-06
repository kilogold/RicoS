import { createHmac, timingSafeEqual } from "node:crypto";
import { getPasskeyByCredentialId } from "@/lib/infrastructure/turso/webhook-db";
import { getWebhookDb } from "@/lib/infrastructure/turso/webhook-db-runtime";

export const ADMIN_SESSION_COOKIE_NAME = "ricos_admin";

const MS_PER_SECOND = 1000;
const SECONDS_PER_HOUR = 60 * 60;
const SESSION_MAX_AGE_HOURS = 12;
const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_HOURS * SECONDS_PER_HOUR * MS_PER_SECOND;

/**
 * Deliberately distinct from STAFF_OPERATIONS_SECRET (the API bearer token).
 * Sharing one secret between the two would let anyone holding the bearer
 * token forge an admin session cookie by hand, bypassing passkeys entirely.
 * No fallback to the old secret: if this is unset, signing/verification must
 * fail closed rather than silently reuse the weaker shared value.
 */
function adminSessionSigningSecret(): string | null {
  const secret = process.env.ADMIN_SESSION_SIGNING_SECRET?.trim();
  return secret || null;
}

function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function signAdminCookie(credentialId: string, now = Date.now()): string | null {
  const secret = adminSessionSigningSecret();
  if (!secret) return null;
  const expiresAt = now + SESSION_MAX_AGE_MS;
  const payload = `${credentialId}.${expiresAt}`;
  const mac = signPayload(payload, secret);
  return `${payload}.${mac}`;
}

export function verifyAdminCookie(
  value: string | null | undefined,
  now = Date.now(),
): { ok: true; credentialId: string } | { ok: false } {
  const secret = adminSessionSigningSecret();
  if (!secret || !value?.trim()) {
    return { ok: false };
  }

  const parts = value.trim().split(".");
  if (parts.length !== 3) {
    return { ok: false };
  }

  const [credentialId, expiresAtRaw, mac] = parts;
  if (!credentialId || !expiresAtRaw || !mac) {
    return { ok: false };
  }

  const expiresAt = Number.parseInt(expiresAtRaw, 10);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    return { ok: false };
  }

  const payload = `${credentialId}.${expiresAtRaw}`;
  const expectedMac = signPayload(payload, secret);
  if (!safeEqual(mac, expectedMac)) {
    return { ok: false };
  }

  return { ok: true, credentialId };
}

/**
 * Full session check: HMAC + expiry (pure, see `verifyAdminCookie`) plus a
 * live lookup that the signing credential still exists in `admin_passkeys`.
 *
 * Passkey removal is a hand-edit-the-DB-only operation with no supported
 * partial-delete path (see admin_passkeys docs), so the store is either
 * untouched or wiped entirely. Without this check, wiping it to re-open
 * bootstrap would leave any already-issued cookie valid as an admin session
 * for up to its remaining lifetime, even though the system believes it has
 * no admins.
 */
export async function verifyAdminSession(
  value: string | null | undefined,
  now = Date.now(),
): Promise<{ ok: true; credentialId: string } | { ok: false }> {
  const hmacResult = verifyAdminCookie(value, now);
  if (!hmacResult.ok) return hmacResult;

  const db = await getWebhookDb();
  const passkey = await getPasskeyByCredentialId(db, hmacResult.credentialId);
  if (!passkey) {
    return { ok: false };
  }

  return hmacResult;
}

export function adminSessionSetCookieHeader(value: string, secure: boolean): string {
  const secureFlag = secure ? "; Secure" : "";
  return `${ADMIN_SESSION_COOKIE_NAME}=${encodeURIComponent(value)}; HttpOnly; Path=/; SameSite=Lax${secureFlag}`;
}

export function readAdminCookieFromRequest(req: Request): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(`${ADMIN_SESSION_COOKIE_NAME}=`)) continue;
    const raw = trimmed.slice(ADMIN_SESSION_COOKIE_NAME.length + 1);
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}

export function readAdminCookieFromCookieHeader(header: string | null | undefined): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(`${ADMIN_SESSION_COOKIE_NAME}=`)) continue;
    const raw = trimmed.slice(ADMIN_SESSION_COOKIE_NAME.length + 1);
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}

export function cookieShouldBeSecure(req: Request): boolean {
  const forwarded = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return forwarded === "https";
}
