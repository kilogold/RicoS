import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { getMenuCatalogCacheScope } from "./menu-catalog-cache-scope";

const originalUrl = process.env.MENU_PUBLISH_MENU_JSON_URL;

const revalidateTag = mock(() => {});

mock.module("next/cache", () => ({ revalidateTag }));

const { invalidateMenuCatalogCache } = await import("./menu-cache-invalidation");

describe("invalidateMenuCatalogCache", () => {
  beforeEach(() => {
    process.env.MENU_PUBLISH_MENU_JSON_URL =
      "https://raw.githubusercontent.com/org/RicoS-Menu/preview/menu.json";
    revalidateTag.mockClear();
  });

  afterEach(() => {
    if (originalUrl === undefined) {
      delete process.env.MENU_PUBLISH_MENU_JSON_URL;
    } else {
      process.env.MENU_PUBLISH_MENU_JSON_URL = originalUrl;
    }
  });

  test("revalidates menu catalog tag with immediate expiry", () => {
    const { tag } = getMenuCatalogCacheScope();
    invalidateMenuCatalogCache();
    expect(revalidateTag).toHaveBeenCalledWith(tag, { expire: 0 });
  });
});
