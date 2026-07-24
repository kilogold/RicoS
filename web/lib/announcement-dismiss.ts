export const ANNOUNCEMENT_DISMISS_COOKIE = "ricos_announcement_dismissed";

const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const DISMISS_RETENTION_DAYS = 90;
const COOKIE_MAX_AGE_SECONDS =
  SECONDS_PER_MINUTE * MINUTES_PER_HOUR * HOURS_PER_DAY * DISMISS_RETENTION_DAYS;

export function getDismissedAnnouncementFingerprint(): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${ANNOUNCEMENT_DISMISS_COOKIE}=`;
  const match = document.cookie
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(prefix));
  if (!match) return null;
  const value = match.slice(prefix.length);
  return value || null;
}

export function markAnnouncementDismissed(fingerprint: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${ANNOUNCEMENT_DISMISS_COOKIE}=${encodeURIComponent(fingerprint)}; Max-Age=${COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax`;
}

export function isAnnouncementDismissed(fingerprint: string): boolean {
  const dismissed = getDismissedAnnouncementFingerprint();
  if (!dismissed) return false;
  try {
    return decodeURIComponent(dismissed) === fingerprint;
  } catch {
    return dismissed === fingerprint;
  }
}
