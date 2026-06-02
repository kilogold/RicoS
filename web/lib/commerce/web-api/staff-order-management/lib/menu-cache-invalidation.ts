import { revalidateTag } from "next/cache";
import { getMenuCatalogCacheScope } from "./menu-catalog-cache-scope";

export function invalidateMenuCatalogCache(): void {
  const { tag } = getMenuCatalogCacheScope();
  revalidateTag(tag, { expire: 0 });
}
