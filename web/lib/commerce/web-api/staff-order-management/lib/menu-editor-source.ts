import {
  computeMenuContentHash,
  parseMenuCatalogFile,
  type MenuCatalogFile,
  type ParsedMenuCatalogFile,
} from "@ricos/shared";
import { setTimeout as sleep } from "node:timers/promises";
import { fetchRemoteMenuCatalog } from "./menu-catalog-remote";

export { hasMenuCatalogChanges, menuCatalogBody } from "./menu-editor-catalog";

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

export function menuCatalogFileFromParsed(parsed: ParsedMenuCatalogFile): MenuCatalogFile {
  return {
    catalogVersion: parsed.catalogVersion,
    publishedAt: parsed.publishedAtIso,
    ...parsed.catalog,
  };
}

export async function fetchCurrentGitMenuForEditor(): Promise<MenuEditorSource> {
  const parsed = await fetchRemoteMenuCatalog();
  const menu = menuCatalogFileFromParsed(parsed);
  const contentHash = await computeMenuContentHash(menu);
  return { menu, contentHash };
}

const RAW_MENU_VERIFY_MAX_ATTEMPTS = 30;
const RAW_MENU_VERIFY_DELAY_MS = 1000;

/** Poll raw.githubusercontent.com until the published catalog hash is visible. */
export async function waitForPublishedMenuOnRawUrl(expectedContentHash: string): Promise<void> {
  for (let attempt = 1; attempt <= RAW_MENU_VERIFY_MAX_ATTEMPTS; attempt++) {
    try {
      const parsed = await fetchRemoteMenuCatalog(undefined, { cacheBust: true });
      const hash = await computeMenuContentHash(menuCatalogFileFromParsed(parsed));
      if (hash === expectedContentHash) return;
    } catch {
      // Raw CDN or parse may lag briefly after commit; retry.
    }
    if (attempt < RAW_MENU_VERIFY_MAX_ATTEMPTS) {
      await sleep(RAW_MENU_VERIFY_DELAY_MS);
    }
  }
  throw new Error(
    `Menu catalog did not appear at MENU_PUBLISH_MENU_JSON_URL after ${RAW_MENU_VERIFY_MAX_ATTEMPTS} attempts.`,
  );
}
