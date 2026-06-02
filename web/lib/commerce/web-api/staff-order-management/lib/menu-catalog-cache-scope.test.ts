import { afterEach, describe, expect, test } from "bun:test";
import { getMenuCatalogCacheScope } from "./menu-catalog-cache-scope";

const originalUrl = process.env.MENU_PUBLISH_MENU_JSON_URL;

describe("getMenuCatalogCacheScope", () => {
  afterEach(() => {
    if (originalUrl === undefined) {
      delete process.env.MENU_PUBLISH_MENU_JSON_URL;
    } else {
      process.env.MENU_PUBLISH_MENU_JSON_URL = originalUrl;
    }
  });

  test("derives stable tag from MENU_PUBLISH_MENU_JSON_URL", () => {
    process.env.MENU_PUBLISH_MENU_JSON_URL =
      "https://raw.githubusercontent.com/org/RicoS-Menu/preview/menu.json";
    const first = getMenuCatalogCacheScope();
    const second = getMenuCatalogCacheScope();
    expect(first.cacheKey).toBe(second.cacheKey);
    expect(first.tag).toBe(`menu-catalog:${first.cacheKey}`);
  });

  test("preview and main URLs produce different cache scopes", () => {
    process.env.MENU_PUBLISH_MENU_JSON_URL =
      "https://raw.githubusercontent.com/org/RicoS-Menu/preview/menu.json";
    const preview = getMenuCatalogCacheScope();

    process.env.MENU_PUBLISH_MENU_JSON_URL =
      "https://raw.githubusercontent.com/org/RicoS-Menu/main/menu.json";
    const main = getMenuCatalogCacheScope();

    expect(preview.cacheKey).not.toBe(main.cacheKey);
    expect(preview.tag).not.toBe(main.tag);
  });
});
