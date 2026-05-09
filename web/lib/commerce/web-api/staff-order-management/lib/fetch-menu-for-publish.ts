import { parseMenuCatalogFile, type ParsedMenuCatalogFile } from "@ricos/shared";
import { requiredEnv } from "@/lib/shared/config/server-env";

/** Only GitHub raw URLs — avoids SSRF via env misconfiguration. */
const ALLOWED_MENU_PUBLISH_HOSTS = new Set(["raw.githubusercontent.com"]);

/**
 * Load `menu.json` from the configured GitHub `main` raw URL (or any ref in the path).
 * Set `MENU_PUBLISH_MENU_JSON_URL` to e.g.
 * `https://raw.githubusercontent.com/<org>/<repo>/main/packages/shared/src/menu.json`
 *
 * For private repos, set `GITHUB_TOKEN` (PAT with contents read).
 */
export async function fetchMenuCatalogForPublish(): Promise<ParsedMenuCatalogFile> {
  const urlRaw = requiredEnv("MENU_PUBLISH_MENU_JSON_URL");
  let url: URL;
  try {
    url = new URL(urlRaw);
  } catch {
    throw new Error("MENU_PUBLISH_MENU_JSON_URL is not a valid URL");
  }
  if (url.protocol !== "https:") {
    throw new Error("MENU_PUBLISH_MENU_JSON_URL must use https");
  }
  if (!ALLOWED_MENU_PUBLISH_HOSTS.has(url.hostname)) {
    throw new Error(
      `MENU_PUBLISH_MENU_JSON_URL host must be raw.githubusercontent.com (got ${url.hostname})`,
    );
  }

  const token = process.env.GITHUB_TOKEN?.trim();
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "RicoS-menu-publish",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, { headers, cache: "no-store" });
  if (!res.ok) {
    throw new Error(
      `Menu JSON fetch failed: HTTP ${res.status} ${res.statusText}. ` +
        `For private repos, set GITHUB_TOKEN with read access to the repository.`,
    );
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new Error("Menu JSON fetch returned a body that is not valid JSON");
  }

  return parseMenuCatalogFile(json);
}
