import {
  computeMenuContentHash,
  parseMenuCatalogFile,
  type MenuCatalogFile,
} from "@ricos/shared";
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

export async function fetchCurrentGitMenuForEditor(): Promise<MenuEditorSource> {
  const parsed = await fetchRemoteMenuCatalog();
  const menu = normalizeMenuCatalogFile(parsed);
  const contentHash = await computeMenuContentHash(menu);
  return { menu, contentHash };
}
