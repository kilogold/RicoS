import { revalidateMenuRuntimeCache } from "@/lib/commerce/revalidate-menu-runtime-cache";
import { fetchMenuCatalogForPublish } from "@/lib/commerce/web-api/staff-order-management/lib/fetch-menu-for-publish";
import {
  hydrateMenuCachesFromDb,
  upsertMenuVersionForPublish,
} from "@/lib/infrastructure/turso/webhook-db";
import { getCommerceDb } from "@/lib/infrastructure/turso/webhook-db-runtime";

/**
 * Writes the next menu version from GitHub `menu.json` (see `MENU_PUBLISH_MENU_JSON_URL`),
 * not from the deployment bundle.
 */
export async function publishMenuFromRepoFile(): Promise<{ version: number }> {
  const parsed = await fetchMenuCatalogForPublish();
  const db = await getCommerceDb();
  await upsertMenuVersionForPublish(db, parsed);
  await hydrateMenuCachesFromDb(db);
  revalidateMenuRuntimeCache();
  return { version: parsed.catalogVersion };
}
