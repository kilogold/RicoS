const DEFAULT_RP_NAME = "RicoS Admin";
const LOCAL_ORIGIN = "http://localhost:3000";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} must be set`);
  }
  return value;
}

export const WEBAUTHN_RP_ID = requiredEnv("WEBAUTHN_RP_ID");

export const WEBAUTHN_RP_NAME =
  process.env.WEBAUTHN_RP_NAME?.trim() || DEFAULT_RP_NAME;

export const ADMIN_SETUP_SECRET = process.env.ADMIN_SETUP_SECRET?.trim() ?? "";

const DEFAULT_MAX_ALLOWED_PASSKEYS = 5;

export function maxAllowedPasskeys(): number {
  const raw = process.env.MAX_ALLOWED_PASSKEYS?.trim();
  if (!raw) return DEFAULT_MAX_ALLOWED_PASSKEYS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_MAX_ALLOWED_PASSKEYS;
  }
  return parsed;
}

/** Empty payload hash for session login challenges. */
export const SESSION_PAYLOAD_HASH = "";

function parseAllowedOrigins(): Set<string> {
  const origins = new Set<string>([
    LOCAL_ORIGIN,
    `https://${WEBAUTHN_RP_ID}`,
  ]);
  const extra = process.env.WEBAUTHN_ALLOWED_ORIGINS?.trim();
  if (extra) {
    for (const part of extra.split(",")) {
      const trimmed = part.trim();
      if (trimmed) origins.add(trimmed);
    }
  }
  return origins;
}

const allowedOrigins = parseAllowedOrigins();

export function expectedOrigin(req: Request): string | null {
  const origin = req.headers.get("origin")?.trim();
  if (origin && allowedOrigins.has(origin)) {
    return origin;
  }

  const host = req.headers.get("host")?.trim();
  if (!host) return null;

  const proto =
    host.startsWith("localhost") || host.startsWith("127.0.0.1")
      ? "http"
      : "https";
  const derived = `${proto}://${host}`;
  return allowedOrigins.has(derived) ? derived : null;
}

export function isOriginAllowed(origin: string): boolean {
  return allowedOrigins.has(origin);
}
