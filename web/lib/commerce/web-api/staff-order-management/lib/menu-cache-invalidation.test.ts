import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { getMenuCatalogCacheScope } from "./menu-catalog-cache-scope";

const originalUrl = process.env.MENU_PUBLISH_MENU_JSON_URL;

const revalidateTag = mock(() => {});
const getLatestMenuRuntime = mock(() =>
  Promise.resolve({
    version: 7,
    catalog: { restaurant: "r", menuName: { en: "m", es: "m" }, categories: [] },
    decodeIndex: { version: 7, items: [], orderFees: {} },
    surface: {},
  }),
);
const waitForPublishedMenuCatalogVersion = mock(() => Promise.resolve());

mock.module("next/cache", () => ({ revalidateTag }));
mock.module("./menu-editor-source", () => ({ waitForPublishedMenuCatalogVersion }));
mock.module("./menu-runtime", () => ({ getLatestMenuRuntime }));

const { invalidateAndWarmMenuCache } = await import("./menu-cache-invalidation");

describe("invalidateAndWarmMenuCache", () => {
  beforeEach(() => {
    process.env.MENU_PUBLISH_MENU_JSON_URL =
      "https://raw.githubusercontent.com/org/RicoS-Menu/preview/menu.json";
    revalidateTag.mockClear();
    getLatestMenuRuntime.mockClear();
    waitForPublishedMenuCatalogVersion.mockClear();
  });

  afterEach(() => {
    if (originalUrl === undefined) {
      delete process.env.MENU_PUBLISH_MENU_JSON_URL;
    } else {
      process.env.MENU_PUBLISH_MENU_JSON_URL = originalUrl;
    }
  });

  test("revalidates tag and warms cache", async () => {
    const { tag } = getMenuCatalogCacheScope();
    const result = await invalidateAndWarmMenuCache();
    expect(revalidateTag).toHaveBeenCalledWith(tag);
    expect(getLatestMenuRuntime).toHaveBeenCalledTimes(1);
    expect(result.version).toBe(7);
  });

  test("waits for expected catalog version before warm", async () => {
    await invalidateAndWarmMenuCache({ expectedCatalogVersion: 7 });
    expect(waitForPublishedMenuCatalogVersion).toHaveBeenCalledWith(7);
  });

  test("throws when warm returns unexpected version", async () => {
    getLatestMenuRuntime.mockImplementationOnce(() =>
      Promise.resolve({
        version: 6,
        catalog: { restaurant: "r", menuName: { en: "m", es: "m" }, categories: [] },
        decodeIndex: { version: 6, items: [], orderFees: {} },
        surface: {},
      }),
    );
    await expect(invalidateAndWarmMenuCache({ expectedCatalogVersion: 7 })).rejects.toThrow(
      "expected v7",
    );
  });
});
