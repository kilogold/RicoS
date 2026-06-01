import {
  buildDecodeIndex,
  createMenuCatalogSurface,
  getPackagedMenuCatalogParsed,
  type DecodeIndex,
  type MenuCatalogSurface,
  type MenuDocument,
} from "@ricos/shared";

export type MenuRuntime = {
  version: number;
  catalog: MenuDocument;
  decodeIndex: DecodeIndex;
  surface: MenuCatalogSurface;
};

/**
 * Active catalog from the deployment bundle (`packages/shared/src/menu.json`).
 * Used for storefront and new checkout after version gate.
 *
 * Not wrapped in `unstable_cache`: Vercel's Data Cache persists entries across
 * redeploys when the cache key is static, which previously served menu v16 after
 * menu.json was bumped to v18.
 */
export async function getLatestMenuRuntime(): Promise<MenuRuntime> {
  const parsed = getPackagedMenuCatalogParsed();
  const catalog = parsed.catalog;
  return {
    version: parsed.catalogVersion,
    catalog,
    decodeIndex: buildDecodeIndex(parsed.catalogVersion, catalog),
    surface: createMenuCatalogSurface(catalog),
  };
}
