import type { ParsedMenuCatalogFile } from "@ricos/shared";
import { requiredEnv } from "@/lib/shared/config/server-env";
import { fetchGitHubMenuCatalogContents } from "./menu-catalog-github";

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
  const target = parseGitHubTargetFromCatalogUrl(urlRaw);
  return fetchGitHubMenuCatalogContents(target);
}
