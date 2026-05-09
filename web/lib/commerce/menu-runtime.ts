import {
  createMenuCatalogSurface,
  type DecodeIndex,
  type MenuCatalogSurface,
  type MenuDocument,
} from "@ricos/shared";
import { unstable_cache } from "next/cache";
import { MENU_RUNTIME_CACHE_TAG } from "./menu-runtime-tags";
import {
  fetchMenuCatalogAndDecodeIndexByVersion,
  fetchMenuRuntimeLatest,
} from "@/lib/infrastructure/turso/webhook-db";
import { getCommerceDb } from "@/lib/infrastructure/turso/webhook-db-runtime";

export type MenuRuntime = {
  version: number;
  catalog: MenuDocument;
  decodeIndex: DecodeIndex;
  surface: MenuCatalogSurface;
};

async function loadLatestMenuRuntimeUncached(): Promise<MenuRuntime> {
  const db = await getCommerceDb();
  const row = await fetchMenuRuntimeLatest(db);
  if (!row) {
    throw new Error("menu_versions is empty; bootstrap or publish a catalog first");
  }
  return {
    version: row.version,
    catalog: row.catalog,
    decodeIndex: row.decodeIndex,
    surface: createMenuCatalogSurface(row.catalog),
  };
}

/**
 * Active catalog: row with `MAX(version)`. Used for storefront and new checkout after version gate.
 */
export const getLatestMenuRuntime = unstable_cache(
  loadLatestMenuRuntimeUncached,
  ["ricos-menu-runtime-latest-v1"],
  { tags: [MENU_RUNTIME_CACHE_TAG] },
);

/**
 * Exact version row — decode, webhooks, kitchen enrichment only. Do not use for new checkout when stale.
 */
export async function getMenuRuntimeByVersion(version: number): Promise<MenuRuntime | null> {
  const db = await getCommerceDb();
  const row = await fetchMenuCatalogAndDecodeIndexByVersion(db, version);
  if (!row) return null;
  return {
    version,
    catalog: row.catalog,
    decodeIndex: row.decodeIndex,
    surface: createMenuCatalogSurface(row.catalog),
  };
}
