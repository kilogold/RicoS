import { getPackagedMenuCatalogParsed } from "@ricos/shared";
import { revalidateMenuRuntimeCache } from "@/lib/commerce/revalidate-menu-runtime-cache";
import {
  hydrateMenuCachesFromDb,
  upsertMenuVersionForPublish,
} from "@/lib/infrastructure/turso/webhook-db";
import { getCommerceDb } from "@/lib/infrastructure/turso/webhook-db-runtime";

export async function publishMenuFromRepoFile(): Promise<{ version: number }> {
  const parsed = getPackagedMenuCatalogParsed();
  const db = await getCommerceDb();
  await upsertMenuVersionForPublish(db, parsed);
  await hydrateMenuCachesFromDb(db);
  revalidateMenuRuntimeCache();
  return { version: parsed.catalogVersion };
}
