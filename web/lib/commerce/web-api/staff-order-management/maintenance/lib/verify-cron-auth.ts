import compare from "tsscmp";

export function verifyCronAuth(authorizationHeader: string | null): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return false;
  }
  const header = authorizationHeader ?? "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) {
    return false;
  }
  const token = header.slice(prefix.length);
  return compare(token, secret);
}
