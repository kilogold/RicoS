import {
  buildDecodeIndex,
  createMenuCatalogSurface,
  type DecodeIndex,
  type MenuCatalogSurface,
  type MenuDocument,
} from "@ricos/shared";
import { unstable_cache } from "next/cache";
import { getMenuCatalogCacheScope } from "./menu-catalog-cache-scope";
import { fetchRemoteMenuCatalog } from "./menu-catalog-remote";

export type MenuRuntime = {
  version: number;
  catalog: MenuDocument;
  decodeIndex: DecodeIndex;
  surface: MenuCatalogSurface;
};

type CachedMenuPayload = {
  version: number;
  catalog: MenuDocument;
  decodeIndex: DecodeIndex;
};

/** Safety net if tag invalidation is missed (e.g. direct RicoS-Menu push without CI). */
const MENU_CACHE_SAFETY_REVALIDATE_SECONDS = 86_400;

async function loadMenuPayloadFromRemote(): Promise<CachedMenuPayload> {
  const parsed = await fetchRemoteMenuCatalog();
  const catalog = parsed.catalog;
  return {
    version: parsed.catalogVersion,
    catalog,
    decodeIndex: buildDecodeIndex(parsed.catalogVersion, catalog),
  };
}

function createCachedMenuLoader(): () => Promise<CachedMenuPayload> {
  const { cacheKey, tag } = getMenuCatalogCacheScope();
  return unstable_cache(loadMenuPayloadFromRemote, ["menu-catalog", cacheKey], {
    tags: [tag],
    revalidate: MENU_CACHE_SAFETY_REVALIDATE_SECONDS,
  });
}

let cachedMenuLoader: (() => Promise<CachedMenuPayload>) | null = null;

function getCachedMenuLoader(): () => Promise<CachedMenuPayload> {
  cachedMenuLoader ??= createCachedMenuLoader();
  return cachedMenuLoader;
}

/**
 * Active catalog from `MENU_PUBLISH_MENU_JSON_URL` (RicoS-Menu repo per deployment).
 * Parsed menu is cached in Next Data Cache; invalidate via `invalidateMenuCatalogCache` (RicoS-Menu CI).
 */
export async function getLatestMenuRuntime(): Promise<MenuRuntime> {
  const payload = await getCachedMenuLoader()();
  return {
    version: payload.version,
    catalog: payload.catalog,
    decodeIndex: payload.decodeIndex,
    surface: createMenuCatalogSurface(payload.catalog),
  };
}

/** @internal Test hook to reset lazy loader between cases. */
export function resetMenuRuntimeCacheLoaderForTests(): void {
  cachedMenuLoader = null;
}
