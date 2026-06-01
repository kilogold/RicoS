import {
  buildDecodeIndex,
  createMenuCatalogSurface,
  getPackagedMenuCatalogParsed,
  type DecodeIndex,
  type MenuCatalogSurface,
  type MenuDocument,
} from "@ricos/shared";
import { unstable_cache } from "next/cache";
import { MENU_RUNTIME_CACHE_TAG } from "./menu-runtime-tags";

export type MenuRuntime = {
  version: number;
  catalog: MenuDocument;
  decodeIndex: DecodeIndex;
  surface: MenuCatalogSurface;
};

type MenuRuntimeSerializable = Omit<MenuRuntime, "surface">;

async function loadPackagedMenuRuntimeSerializable(): Promise<MenuRuntimeSerializable> {
  const parsed = getPackagedMenuCatalogParsed();
  return {
    version: parsed.catalogVersion,
    catalog: parsed.catalog,
    decodeIndex: buildDecodeIndex(parsed.catalogVersion, parsed.catalog),
  };
}

const getLatestMenuRuntimeCached = unstable_cache(
  loadPackagedMenuRuntimeSerializable,
  ["ricos-menu-runtime-packaged-v1"],
  { tags: [MENU_RUNTIME_CACHE_TAG] },
);

/**
 * Active catalog from the deployment bundle (`packages/shared/src/menu.json`).
 * Used for storefront and new checkout after version gate.
 *
 * `surface` holds methods and must not be stored inside `unstable_cache` — cached payloads are
 * serialized, which strips functions and breaks helpers like `getItemById`.
 */
export async function getLatestMenuRuntime(): Promise<MenuRuntime> {
  const data = await getLatestMenuRuntimeCached();
  return {
    ...data,
    surface: createMenuCatalogSurface(data.catalog),
  };
}
