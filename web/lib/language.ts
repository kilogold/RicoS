import { DEFAULT_LANGUAGE, type Language } from "@ricos/shared";

export const LANGUAGE_COOKIE = "ricos.language";

const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const LANGUAGE_RETENTION_DAYS = 365;
export const LANGUAGE_COOKIE_MAX_AGE_SECONDS =
  SECONDS_PER_MINUTE * MINUTES_PER_HOUR * HOURS_PER_DAY * LANGUAGE_RETENTION_DAYS;

export function parseLanguage(value: string | undefined | null): Language {
  return value === "en" || value === "es" ? value : DEFAULT_LANGUAGE;
}

export function writeLanguageCookie(language: Language): void {
  if (typeof document === "undefined") return;
  try {
    document.cookie = `${LANGUAGE_COOKIE}=${language}; Max-Age=${LANGUAGE_COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax`;
  } catch {
    // Switching still works for this session when cookies are unavailable.
  }
}
