import { createHash } from "node:crypto";
import { requiredEnv } from "@/lib/shared/config/server-env";

export function getMenuCatalogCacheScope(): { cacheKey: string; tag: string } {
  const url = requiredEnv("MENU_PUBLISH_MENU_JSON_URL");
  const cacheKey = createHash("sha256").update(url).digest("hex").slice(0, 16);
  return { cacheKey, tag: `menu-catalog:${cacheKey}` };
}
