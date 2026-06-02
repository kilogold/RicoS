import { revalidateTag } from "next/cache";
import { getMenuCatalogCacheScope } from "./menu-catalog-cache-scope";
import { waitForPublishedMenuCatalogVersion } from "./menu-editor-source";
import { getLatestMenuRuntime } from "./menu-runtime";

export type InvalidateAndWarmMenuCacheOptions = {
  expectedCatalogVersion?: number;
};

export async function invalidateAndWarmMenuCache(
  options: InvalidateAndWarmMenuCacheOptions = {},
): Promise<{ version: number }> {
  const { tag } = getMenuCatalogCacheScope();
  revalidateTag(tag);

  if (options.expectedCatalogVersion !== undefined) {
    await waitForPublishedMenuCatalogVersion(options.expectedCatalogVersion);
  }

  const runtime = await getLatestMenuRuntime();

  if (
    options.expectedCatalogVersion !== undefined &&
    runtime.version !== options.expectedCatalogVersion
  ) {
    throw new Error(
      `Menu cache warm returned v${runtime.version}, expected v${options.expectedCatalogVersion}.`,
    );
  }

  return { version: runtime.version };
}
