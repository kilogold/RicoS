/**
 * Menu item thumbnail pathnames resolve against the linked public Vercel Blob store.
 * Catalogs store pathnames only; the web app joins MENU_BLOB_BASE_URL at render time.
 */

/** Well-known pathname for the shared fallback thumbnail blob. */
export const MENU_FALLBACK_THUMBNAIL_PATHNAME = "menu-thumbnails/fallback.webp";

/**
 * Validate a catalog thumbnail pathname (relative blob path, not a URL).
 * @throws Error when invalid
 */
export function parseThumbnailPathname(raw: unknown, ctx: string): string {
  if (typeof raw !== "string") {
    throw new Error(`Invalid menu: ${ctx} thumbnailPathname is required`);
  }
  const pathname = raw.trim();
  if (!pathname) {
    throw new Error(`Invalid menu: ${ctx} thumbnailPathname is required`);
  }
  if (pathname !== raw) {
    throw new Error(`Invalid menu: ${ctx} thumbnailPathname must not have leading/trailing whitespace`);
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(pathname) || pathname.startsWith("//")) {
    throw new Error(`Invalid menu: ${ctx} thumbnailPathname must be a relative blob pathname, not a URL`);
  }
  if (pathname.startsWith("/")) {
    throw new Error(`Invalid menu: ${ctx} thumbnailPathname must not start with "/"`);
  }
  return pathname;
}

/**
 * Join a public blob store origin with a catalog pathname.
 * `baseUrl` should be the store origin only (no trailing slash), e.g.
 * `https://<storeId>.public.blob.vercel-storage.com`.
 */
export function resolveMenuThumbnailUrl(pathname: string, baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  const path = pathname.replace(/^\/+/, "");
  return `${base}/${path}`;
}
