import { canonicalJson } from "@ricos/shared";
import { revalidateMenuRuntimeCache } from "@/lib/commerce/revalidate-menu-runtime-cache";
import { fetchMenuCatalogForPublish } from "@/lib/commerce/web-api/staff-order-management/lib/fetch-menu-for-publish";
import {
  fetchMenuRuntimeLatestCatalogJson,
  hydrateMenuCachesFromDb,
  upsertMenuVersionForPublish,
} from "@/lib/infrastructure/turso/webhook-db";
import { getCommerceDb } from "@/lib/infrastructure/turso/webhook-db-runtime";

export type PublishMenuFromRepoFileResult = {
  version: number;
  /** True when Git `menu.json` `categories` matched active DB row (no write). */
  skipped?: boolean;
};

/**
 * Writes the next menu version from GitHub `menu.json` (see `MENU_PUBLISH_MENU_JSON_URL`),
 * not from the deployment bundle.
 *
 * Idempotency is intentionally narrow: structural compare of the `categories` array only.
 * `restaurant` and `menuName` are treated as fixed branding and are not part of the dedup
 * decision; if they ever change in `menu.json` without a `categories` change, this skip
 * path will NOT republish. Bump-only-header edits are not supported by design — the goal
 * is to absorb redundant publish hits, not to track non-menu metadata.
 *
 * The DB string is JSON-parsed and `categories` re-serialized through `canonicalJson`,
 * so whitespace, key order, or non-canonical legacy/manual writes do not affect the result.
 */
export async function publishMenuFromRepoFile(): Promise<PublishMenuFromRepoFileResult> {
  const parsed = await fetchMenuCatalogForPublish();
  const db = await getCommerceDb();

  const activeCatalog = await fetchMenuRuntimeLatestCatalogJson(db);
  if (activeCatalog && activeCatalog.catalogJson.length > 0) {
    let dbCatalog: { categories?: unknown } | null = null;
    try {
      const parsedDb = JSON.parse(activeCatalog.catalogJson);
      if (parsedDb && typeof parsedDb === "object" && !Array.isArray(parsedDb)) {
        dbCatalog = parsedDb as { categories?: unknown };
      }
    } catch {
      // Corrupt row: fall through and let upsert's hash check raise instead of skipping.
    }
    if (dbCatalog && Array.isArray(dbCatalog.categories)) {
      const gitCategoriesCanon = canonicalJson(parsed.catalog.categories);
      const dbCategoriesCanon = canonicalJson(dbCatalog.categories);
      if (gitCategoriesCanon === dbCategoriesCanon) {
        return { version: activeCatalog.version, skipped: true };
      }
    }
  }

  await upsertMenuVersionForPublish(db, parsed);
  await hydrateMenuCachesFromDb(db);
  revalidateMenuRuntimeCache();
  return { version: parsed.catalogVersion };
}
