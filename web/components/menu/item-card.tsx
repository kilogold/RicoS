"use client";

import { getAppStrings } from "@/lib/i18n";
import {
  getMenuBlobBaseUrl,
  shouldShowMenuThumbnail,
} from "@/lib/menu-thumbnail-display";
import { formatUsd } from "@/lib/pricing";
import {
  MENU_FALLBACK_THUMBNAIL_PATHNAME,
  resolveMenuThumbnailUrl,
  type Language,
  type MenuCatalogSurface,
  type MenuItem,
} from "@ricos/shared";
import Image from "next/image";
import { useEffect, useState } from "react";
import { HiPencilSquare } from "react-icons/hi2";

type ItemCardProps = {
  item: MenuItem;
  surface: MenuCatalogSurface;
  language: Language;
  browseOnly: boolean;
  hasModifiers: boolean;
  onQuickAdd: () => void;
  onOpenModal: () => void;
};

const actionButtonClassName =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-lg font-bold text-white shadow transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-45";

export function ItemCard({
  item,
  surface,
  language,
  browseOnly,
  hasModifiers,
  onQuickAdd,
  onOpenModal,
}: ItemCardProps) {
  const copy = getAppStrings(language);
  const name = surface.resolveLocalizedText(item.name, language);
  const description = surface.resolveLocalizedText(item.description, language);
  const priceLabel = `${formatUsd(item.priceCents, language)}${hasModifiers ? "+" : ""}`;

  const showThumbnail = shouldShowMenuThumbnail(item.thumbnailPathname);
  const blobBaseUrl = getMenuBlobBaseUrl();
  const catalogThumbnailUrl =
    showThumbnail && blobBaseUrl
      ? resolveMenuThumbnailUrl(item.thumbnailPathname, blobBaseUrl)
      : null;

  const [imageSrc, setImageSrc] = useState<string | null>(catalogThumbnailUrl);

  useEffect(() => {
    setImageSrc(catalogThumbnailUrl);
  }, [catalogThumbnailUrl]);

  const handleImageError = () => {
    if (!imageSrc || !blobBaseUrl) return;
    const fallbackUrl = resolveMenuThumbnailUrl(MENU_FALLBACK_THUMBNAIL_PATHNAME, blobBaseUrl);
    if (imageSrc === fallbackUrl) {
      console.error("Menu fallback thumbnail failed to load:", fallbackUrl);
      return;
    }
    // Missing custom blob → same display rules as a fallback-designated item.
    setImageSrc(
      shouldShowMenuThumbnail(MENU_FALLBACK_THUMBNAIL_PATHNAME) ? fallbackUrl : null,
    );
  };

  const actionButton = hasModifiers ? (
    <button
      type="button"
      disabled={browseOnly}
      aria-disabled={browseOnly}
      onClick={() => {
        if (browseOnly) return;
        onOpenModal();
      }}
      aria-label={`${copy.openItemAria}: ${name}`}
      className={actionButtonClassName}
    >
      <HiPencilSquare className="h-5 w-5" aria-hidden />
    </button>
  ) : (
    <button
      type="button"
      disabled={browseOnly}
      aria-disabled={browseOnly}
      onClick={() => {
        if (browseOnly) return;
        onQuickAdd();
      }}
      aria-label={`${copy.quickAddAria}: ${name}`}
      className={actionButtonClassName}
    >
      +
    </button>
  );

  return (
    <article
      className={`group relative flex h-full flex-row items-center gap-3 rounded-xl border border-foreground/10 bg-surface p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-md ${
        browseOnly ? "opacity-60" : ""
      }`}
    >
      {imageSrc ? (
        <div className="relative aspect-square w-20 shrink-0 overflow-hidden rounded-lg sm:w-24">
          <Image
            src={imageSrc}
            alt={name}
            fill
            sizes="(max-width: 640px) 5rem, 6rem"
            className="object-cover"
            onError={handleImageError}
          />
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col py-0.5">
        <h4 className="text-base font-semibold leading-snug text-foreground">{name}</h4>
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted">{description}</p>
        <p className="mt-3 text-sm font-semibold text-accent">{priceLabel}</p>
      </div>

      <div className="shrink-0 self-center">{actionButton}</div>
    </article>
  );
}
