"use client";

import { getMenuBlobBaseUrl } from "@/lib/menu-thumbnail-display";
import {
  MENU_FALLBACK_THUMBNAIL_PATHNAME,
  resolveMenuThumbnailUrl,
} from "@ricos/shared";
import { useCallback, useEffect, useState } from "react";
import { useMenuEditor } from "./menu-editor-context";
import { StatusBanner } from "./menu-editor-fields";
import { itemDisplayName } from "./menu-editor-utils";

/** Blob list entry from the staff thumbnails API. */
type ThumbnailBlob = {
  /** Object key stored on the catalog item (`menu-thumbnails/...`). */
  pathname: string;
  /** Absolute public URL for rendering the library preview. */
  url: string;
};
type LibraryFilter = "all" | "referenced" | "unreferenced";

const THUMBNAILS_API = "/api/staff/admin/menu/thumbnails";

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

export function MenuEditorGalleryPane() {
  const { theme, menu, selected, fieldChanged, updateSelectedItem } = useMenuEditor();
  const item = selected.item;

  const [blobs, setBlobs] = useState<ThumbnailBlob[]>([]);
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blobBaseUrl = getMenuBlobBaseUrl();
  // Build a lookup of "which draft items use this blob pathname?" so the library can
  // mark blobs as referenced vs unreferenced and enforce 1:1 pick (only orphans, or this item's own).
  const ownersByPath = Map.groupBy(
    // Collapse nested categories into a single list of draft menu items.
    menu.categories.flatMap((category) => category.items),
    // Key = catalog thumbnail pathname; value = every draft item that points at it.
    (draftItem) => draftItem.thumbnailPathname,
  );

  const refresh = useCallback(async () => {
    setError(null);
    const response = await fetch(THUMBNAILS_API, { credentials: "include" });
    if (!response.ok) {
      setError(await readErrorMessage(response));
      return;
    }
    const body = (await response.json()) as { blobs?: ThumbnailBlob[] };
    setBlobs(body.blobs ?? []);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filteredBlobs = blobs.filter((blob) => {
    const referenced = (ownersByPath.get(blob.pathname)?.length ?? 0) > 0;
    if (filter === "referenced") return referenced;
    if (filter === "unreferenced") return !referenced;
    return true;
  });

  if (!item) return null;

  const setThumbnailPathname = (pathname: string) => {
    updateSelectedItem((current) => ({ ...current, thumbnailPathname: pathname }));
  };

  const canPick = (pathname: string): boolean => {
    if (pathname === MENU_FALLBACK_THUMBNAIL_PATHNAME) return false;
    if (pathname === item.thumbnailPathname) return true;
    const owners = ownersByPath.get(pathname) ?? [];
    return owners.length === 0;
  };

  const onUpload = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("itemId", item.id);
      form.set("file", file);
      const response = await fetch(THUMBNAILS_API, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!response.ok) {
        setError(await readErrorMessage(response));
        return;
      }
      const body = (await response.json()) as { pathname?: string };
      if (!body.pathname) {
        setError("Upload succeeded but pathname was missing.");
        return;
      }
      setThumbnailPathname(body.pathname);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const onPick = (pathname: string) => {
    if (!canPick(pathname)) return;
    setThumbnailPathname(pathname);
  };

  const onClear = () => {
    setThumbnailPathname(MENU_FALLBACK_THUMBNAIL_PATHNAME);
  };

  const onDelete = async (blob: ThumbnailBlob) => {
    if (blob.pathname === MENU_FALLBACK_THUMBNAIL_PATHNAME) return;

    const owners = ownersByPath.get(blob.pathname) ?? [];
    const confirmed =
      owners.length > 0
        ? window.confirm(
            `Delete ${blob.pathname}?\n\nReferenced by draft item: ${owners
              .map((owner) => `${itemDisplayName(owner)} (${owner.id})`)
              .join(", ")}.\nStorefront will show the runtime fallback until catalog pathnames are updated and published.`,
          )
        : window.confirm(
            `Delete ${blob.pathname}?\n\nUnreferenced means no item in the current editor draft points at it — not safe across git history. Older published menu.json versions may still list this pathname and will show the storefront fallback until republished with valid paths.`,
          );
    if (!confirmed) return;

    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `${THUMBNAILS_API}?pathname=${encodeURIComponent(blob.pathname)}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!response.ok) {
        setError(await readErrorMessage(response));
        return;
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const previewUrl = blobBaseUrl
    ? resolveMenuThumbnailUrl(item.thumbnailPathname, blobBaseUrl)
    : null;

  return (
    <div className={`space-y-5 rounded-lg border p-5 ${theme.panel}`}>
      {error ? <StatusBanner tone="error">{error}</StatusBanner> : null}

      <section>
        <h3 className={`text-base font-medium ${theme.strongText}`}>Current item</h3>
        <p className={`mt-1 text-sm ${theme.mutedText}`}>
          Draft pathname
          {fieldChanged("thumbnailPathname", item.thumbnailPathname) ? (
            <span className={`ml-2 text-xs font-semibold ${theme.changedText}`}>Edited</span>
          ) : null}
        </p>
        <code className={`mt-2 block break-all text-xs ${theme.mutedText}`}>
          {item.thumbnailPathname}
        </code>
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- admin preview; arbitrary blob URLs
          <img
            src={previewUrl}
            alt=""
            className="mt-3 h-28 w-40 rounded-md border object-cover"
          />
        ) : (
          <p className={`mt-3 text-sm ${theme.mutedText}`}>
            Set NEXT_PUBLIC_MENU_BLOB_BASE_URL to preview thumbnails.
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <label
            className={`inline-flex min-h-10 cursor-pointer items-center rounded-md border px-3 text-sm font-medium ${theme.softButton} ${busy ? "opacity-50" : ""}`}
          >
            Upload
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                event.target.value = "";
                void onUpload(file);
              }}
            />
          </label>
          <button
            type="button"
            disabled={busy || item.thumbnailPathname === MENU_FALLBACK_THUMBNAIL_PATHNAME}
            onClick={onClear}
            className={`min-h-10 rounded-md border px-3 text-sm font-medium disabled:opacity-30 ${theme.neutralButton}`}
          >
            Clear to fallback
          </button>
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className={`text-base font-medium ${theme.strongText}`}>Library</h3>
            <p className={`mt-1 text-sm ${theme.mutedText}`}>
              Referenced vs draft catalog only. Pick orphans only (1:1 custom thumbs).
            </p>
          </div>
          <div className="inline-flex gap-1 rounded-md border p-1">
            {(
              [
                ["all", "All"],
                ["referenced", "Referenced"],
                ["unreferenced", "Unreferenced"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={`min-h-8 rounded px-3 text-sm ${
                  filter === id ? theme.tabActive : theme.tabInactive
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredBlobs.map((blob) => {
            const owners = ownersByPath.get(blob.pathname) ?? [];
            const isFallback = blob.pathname === MENU_FALLBACK_THUMBNAIL_PATHNAME;
            const pickable = canPick(blob.pathname);
            const isCurrent = blob.pathname === item.thumbnailPathname;
            return (
              <li
                key={blob.pathname}
                className={`overflow-hidden rounded-md border ${theme.cardBorder} ${isCurrent ? "ring-2 ring-violet-500" : ""}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={blob.url} alt="" className="aspect-3/2 w-full object-cover" />
                <div className="space-y-2 p-3">
                  <code className={`block break-all text-[11px] ${theme.mutedText}`}>
                    {blob.pathname}
                  </code>
                  <p className={`text-xs ${theme.mutedText}`}>
                    {isFallback
                      ? "Shared fallback"
                      : owners.length > 0
                        ? `Used by ${owners.map((owner) => owner.id).join(", ")}`
                        : "Unreferenced"}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy || !pickable}
                      onClick={() => onPick(blob.pathname)}
                      className={`min-h-8 rounded-md border px-2 text-sm disabled:opacity-30 ${theme.softButton}`}
                    >
                      {isCurrent ? "Current" : "Pick"}
                    </button>
                    {!isFallback ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void onDelete(blob)}
                        className={`min-h-8 rounded-md border px-2 text-sm ${theme.dangerButton}`}
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        {filteredBlobs.length === 0 ? (
          <p className={`mt-4 text-sm ${theme.mutedText}`}>No blobs in this filter.</p>
        ) : null}
      </section>
    </div>
  );
}
