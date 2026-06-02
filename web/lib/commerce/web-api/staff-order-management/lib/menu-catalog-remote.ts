import { parseMenuCatalogFile, type ParsedMenuCatalogFile } from "@ricos/shared";
import { requiredEnv } from "@/lib/shared/config/server-env";

const ALLOWED_MENU_CATALOG_HOSTS = new Set(["raw.githubusercontent.com"]);
const DEFAULT_MENU_JSON_PATH = "menu.json";

export type GitHubCatalogTarget = {
  owner: string;
  repo: string;
  branch: string;
  path: string;
};

export function parseMenuCatalogJsonUrl(urlRaw?: string): URL {
  const raw = urlRaw?.trim() ?? requiredEnv("MENU_PUBLISH_MENU_JSON_URL");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("MENU_PUBLISH_MENU_JSON_URL is not a valid URL");
  }
  if (url.protocol !== "https:") {
    throw new Error("MENU_PUBLISH_MENU_JSON_URL must use https");
  }
  if (!ALLOWED_MENU_CATALOG_HOSTS.has(url.hostname)) {
    throw new Error(
      `MENU_PUBLISH_MENU_JSON_URL host must be raw.githubusercontent.com (got ${url.hostname})`,
    );
  }
  return url;
}

function splitRawGitHubRefAndPath(parts: string[]): { branch: string; path: string } {
  if (parts[0] === "refs" && parts[1] === "heads" && parts.length > 2) {
    const refAndPath = parts.slice(2);
    const [branch, ...pathParts] = refAndPath;
    if (!branch) {
      throw new Error("MENU_PUBLISH_MENU_JSON_URL must include a branch");
    }
    return {
      branch,
      path: pathParts.length > 0 ? pathParts.join("/") : DEFAULT_MENU_JSON_PATH,
    };
  }

  const [branch, ...pathParts] = parts;
  if (!branch) {
    throw new Error("MENU_PUBLISH_MENU_JSON_URL must include owner, repo, and branch");
  }
  return {
    branch,
    path: pathParts.length > 0 ? pathParts.join("/") : DEFAULT_MENU_JSON_PATH,
  };
}

export function parseGitHubTargetFromCatalogUrl(urlRaw?: string): GitHubCatalogTarget {
  const url = parseMenuCatalogJsonUrl(urlRaw);
  if (url.hostname !== "raw.githubusercontent.com") {
    throw new Error("MENU_PUBLISH_MENU_JSON_URL must use raw.githubusercontent.com");
  }
  const segments = url.pathname.split("/").filter(Boolean);
  const [owner, repo, ...refAndPathParts] = segments;
  if (!owner || !repo || refAndPathParts.length === 0) {
    throw new Error(
      "MENU_PUBLISH_MENU_JSON_URL must include owner, repo, branch, and optional path (default menu.json)",
    );
  }
  const { branch, path } = splitRawGitHubRefAndPath(refAndPathParts);
  return { owner, repo, branch, path };
}

export async function fetchRemoteMenuCatalog(urlRaw?: string): Promise<ParsedMenuCatalogFile> {
  const url = parseMenuCatalogJsonUrl(urlRaw);
  // raw.githubusercontent.com CDN caches public responses for ~5 minutes (max-age=300).
  // Vercel cache purges do not affect this layer; bust on every read so publishes show promptly.
  url.searchParams.set("_", String(Date.now()));
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "RicoS-menu-catalog",
    "Cache-Control": "no-cache",
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

  return parseMenuCatalogFile(raw);
}
