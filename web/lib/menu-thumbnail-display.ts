import { MENU_FALLBACK_THUMBNAIL_PATHNAME } from "@ricos/shared";

/** Public blob store origin for joining catalog pathnames. Null when unset. */
export function getMenuBlobBaseUrl(): string | null {
  return process.env.NEXT_PUBLIC_MENU_BLOB_BASE_URL?.trim() || null;
}

/**
 * Whether ItemCard should render a thumbnail for this pathname.
 * Requires NEXT_PUBLIC_MENU_BLOB_BASE_URL. Shared fallback is hidden when
 * NEXT_PUBLIC_MENU_THUMBNAIL_FALLBACK_MODE=skip (default: show).
 */
export function shouldShowMenuThumbnail(pathname: string): boolean {
  const baseUrl = getMenuBlobBaseUrl();
  if (!baseUrl) return false;
  if (pathname === MENU_FALLBACK_THUMBNAIL_PATHNAME) {
    return process.env.NEXT_PUBLIC_MENU_THUMBNAIL_FALLBACK_MODE?.trim() !== "skip";
  }
  return true;
}
