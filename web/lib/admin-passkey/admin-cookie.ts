import { createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_SESSION_COOKIE_NAME = "ricos_admin";

const MS_PER_SECOND = 1000;
const SECONDS_PER_HOUR = 60 * 60;
const SESSION_MAX_AGE_HOURS = 12;
const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_HOURS * SECONDS_PER_HOUR * MS_PER_SECOND;

function staffPublishSecret(): string | null {
  const secret = process.env.STAFF_MENU_PUBLISH_SECRET?.trim();
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
  const secret = staffPublishSecret();
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
  const secret = staffPublishSecret();
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
