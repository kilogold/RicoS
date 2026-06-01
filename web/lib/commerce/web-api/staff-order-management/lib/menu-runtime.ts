import {
  buildDecodeIndex,
  createMenuCatalogSurface,
  type DecodeIndex,
  type MenuCatalogSurface,
  type MenuDocument,
} from "@ricos/shared";
import { unstable_noStore as noStore } from "next/cache";
import { fetchRemoteMenuCatalog } from "./menu-catalog-remote";

export type MenuRuntime = {
  version: number;
  catalog: MenuDocument;
  decodeIndex: DecodeIndex;
  surface: MenuCatalogSurface;
};

/**
 * Active catalog from `MENU_PUBLISH_MENU_JSON_URL` (RicoS-Menu repo per deployment).
 * Used for storefront and new checkout after version gate.
 *
 * Uses `noStore()` so menu reads are never stored in Next.js / Vercel Data Cache.
 */
export async function getLatestMenuRuntime(): Promise<MenuRuntime> {
  noStore();
  const parsed = await fetchRemoteMenuCatalog();
  const catalog = parsed.catalog;
  return {
    version: parsed.catalogVersion,
    catalog,
    decodeIndex: buildDecodeIndex(parsed.catalogVersion, catalog),
    surface: createMenuCatalogSurface(catalog),
  };
}
