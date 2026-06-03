import {
  computeMenuContentHash,
  parseExpandedMenuCatalogFile,
  parseMenuCatalogFile,
  type MenuCatalogFile,
  type ParsedMenuCatalogFile,
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

/** Editor/runtime manifest with inline item modifier groups (not on-disk refs). */
export function normalizeExpandedMenuCatalogFile(raw: unknown): MenuCatalogFile {
  const parsed = parseExpandedMenuCatalogFile(raw);
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
