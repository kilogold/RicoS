export const THEME_COOKIE = "ricos.theme";

export type Theme = "light" | "dark";

const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const THEME_RETENTION_DAYS = 365;
export const THEME_COOKIE_MAX_AGE_SECONDS =
  SECONDS_PER_MINUTE * MINUTES_PER_HOUR * HOURS_PER_DAY * THEME_RETENTION_DAYS;

export function parseTheme(value: string | undefined | null): Theme {
  return value === "dark" ? "dark" : "light";
}

export function writeThemeCookie(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.cookie = `${THEME_COOKIE}=${theme}; Max-Age=${THEME_COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax`;
}
