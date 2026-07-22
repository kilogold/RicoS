import { afterEach, describe, expect, test } from "bun:test";
import { MENU_FALLBACK_THUMBNAIL_PATHNAME } from "@ricos/shared";
import { getMenuBlobBaseUrl, shouldShowMenuThumbnail } from "./menu-thumbnail-display";

const BASE = "https://example.public.blob.vercel-storage.com";
const CUSTOM = "menu-thumbnails/custom.webp";

const originalBase = process.env.NEXT_PUBLIC_MENU_BLOB_BASE_URL;
const originalMode = process.env.NEXT_PUBLIC_MENU_THUMBNAIL_FALLBACK_MODE;

afterEach(() => {
  if (originalBase === undefined) {
    delete process.env.NEXT_PUBLIC_MENU_BLOB_BASE_URL;
  } else {
    process.env.NEXT_PUBLIC_MENU_BLOB_BASE_URL = originalBase;
  }
  if (originalMode === undefined) {
    delete process.env.NEXT_PUBLIC_MENU_THUMBNAIL_FALLBACK_MODE;
  } else {
    process.env.NEXT_PUBLIC_MENU_THUMBNAIL_FALLBACK_MODE = originalMode;
  }
});

describe("getMenuBlobBaseUrl", () => {
  test("returns null when unset or blank", () => {
    delete process.env.NEXT_PUBLIC_MENU_BLOB_BASE_URL;
    expect(getMenuBlobBaseUrl()).toBeNull();
    process.env.NEXT_PUBLIC_MENU_BLOB_BASE_URL = "   ";
    expect(getMenuBlobBaseUrl()).toBeNull();
  });

  test("returns trimmed origin", () => {
    process.env.NEXT_PUBLIC_MENU_BLOB_BASE_URL = ` ${BASE} `;
    expect(getMenuBlobBaseUrl()).toBe(BASE);
  });
});

describe("shouldShowMenuThumbnail", () => {
  test("false when base URL missing", () => {
    delete process.env.NEXT_PUBLIC_MENU_BLOB_BASE_URL;
    delete process.env.NEXT_PUBLIC_MENU_THUMBNAIL_FALLBACK_MODE;
    expect(shouldShowMenuThumbnail(CUSTOM)).toBe(false);
    expect(shouldShowMenuThumbnail(MENU_FALLBACK_THUMBNAIL_PATHNAME)).toBe(false);
  });

  test("custom pathname true when base URL set", () => {
    process.env.NEXT_PUBLIC_MENU_BLOB_BASE_URL = BASE;
    process.env.NEXT_PUBLIC_MENU_THUMBNAIL_FALLBACK_MODE = "skip";
    expect(shouldShowMenuThumbnail(CUSTOM)).toBe(true);
  });

  test("fallback true by default when base URL set", () => {
    process.env.NEXT_PUBLIC_MENU_BLOB_BASE_URL = BASE;
    delete process.env.NEXT_PUBLIC_MENU_THUMBNAIL_FALLBACK_MODE;
    expect(shouldShowMenuThumbnail(MENU_FALLBACK_THUMBNAIL_PATHNAME)).toBe(true);
  });

  test("fallback true when mode is show", () => {
    process.env.NEXT_PUBLIC_MENU_BLOB_BASE_URL = BASE;
    process.env.NEXT_PUBLIC_MENU_THUMBNAIL_FALLBACK_MODE = "show";
    expect(shouldShowMenuThumbnail(MENU_FALLBACK_THUMBNAIL_PATHNAME)).toBe(true);
  });

  test("fallback false when mode is skip", () => {
    process.env.NEXT_PUBLIC_MENU_BLOB_BASE_URL = BASE;
    process.env.NEXT_PUBLIC_MENU_THUMBNAIL_FALLBACK_MODE = "skip";
    expect(shouldShowMenuThumbnail(MENU_FALLBACK_THUMBNAIL_PATHNAME)).toBe(false);
  });
});
