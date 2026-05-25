import {
  computeMenuContentHash,
  parseMenuCatalogFile,
  type MenuCatalogFile,
} from "@ricos/shared";
import { requiredEnv } from "@/lib/shared/config/server-env";

const ALLOWED_MENU_PUBLISH_HOSTS = new Set(["raw.githubusercontent.com"]);

export type MenuEditorSource = {
  menu: MenuCatalogFile;
  contentHash: string;
};

export function normalizeMenuCatalogFile(raw: unknown): MenuCatalogFile {
  const parsed = parseMenuCatalogFile(raw);
  return {
    catalogVersion: parsed.catalogVersion,
    publishedAt: parsed.publishedAtIso,
    ...parsed.catalog,
  };
}

export async function fetchCurrentGitMenuForEditor(): Promise<MenuEditorSource> {
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

  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "RicoS-menu-editor",
  };
  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(url, { headers, cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Menu JSON fetch failed: HTTP ${response.status} ${response.statusText}`);
  }

  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw new Error("Menu JSON fetch returned a body that is not valid JSON");
  }

  const menu = normalizeMenuCatalogFile(raw);
  const contentHash = await computeMenuContentHash(menu);
  return { menu, contentHash };
}
