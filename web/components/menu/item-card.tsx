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
import { useEffect, useState, type MouseEvent } from "react";

type ItemCardProps = {
  item: MenuItem;
  surface: MenuCatalogSurface;
  language: Language;
  browseOnly: boolean;
  hasModifiers: boolean;
  onQuickAdd: () => void;
  onOpenModal: () => void;
};

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

  const handleCardClick = () => {
    if (browseOnly) return;
    if (hasModifiers) onOpenModal();
  };

  const handleQuickAdd = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (browseOnly) return;
    onQuickAdd();
  };

  const quickAddButton = !hasModifiers ? (
    <button
      type="button"
      disabled={browseOnly}
      aria-disabled={browseOnly}
      onClick={handleQuickAdd}
      aria-label={`${copy.quickAddAria}: ${name}`}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-lg font-bold text-white shadow transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-45"
    >
      +
    </button>
  ) : null;

  const customizeBadge = hasModifiers ? (
    <span className="shrink-0 rounded-md border border-accent/40 bg-accent/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-accent">
      {copy.customize}
    </span>
  ) : null;

  return (
    <article
      className={`group relative flex h-full rounded-xl border border-foreground/10 bg-surface shadow-sm transition hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-md ${
        imageSrc ? "flex-row gap-3 p-3" : "flex-col p-4"
      } ${hasModifiers && !browseOnly ? "cursor-pointer" : ""} ${browseOnly ? "opacity-60" : ""}`}
      onClick={handleCardClick}
      onKeyDown={(event) => {
        if (browseOnly || !hasModifiers) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenModal();
        }
      }}
      role={hasModifiers ? "button" : undefined}
      tabIndex={hasModifiers && !browseOnly ? 0 : undefined}
      aria-label={hasModifiers ? `${copy.openItemAria}: ${name}` : undefined}
    >
      <div className={`flex min-w-0 flex-1 flex-col ${imageSrc ? "py-0.5" : ""}`}>
        <div className="flex items-start justify-between gap-3">
          <h4 className="text-base font-semibold leading-snug text-foreground">{name}</h4>
          {imageSrc ? customizeBadge : !hasModifiers ? quickAddButton : customizeBadge}
        </div>
        <p
          className={`mt-2 line-clamp-2 text-sm leading-relaxed text-muted ${
            imageSrc ? "" : "flex-1"
          }`}
        >
          {description}
        </p>
        <p className="mt-3 text-sm font-semibold text-accent">{priceLabel}</p>
      </div>

      {imageSrc ? (
        <div className="relative w-[42%] max-w-44 shrink-0 self-stretch">
          <div className="relative aspect-3/2 w-full overflow-hidden rounded-lg">
            <Image
              src={imageSrc}
              alt={name}
              fill
              sizes="(max-width: 640px) 42vw, (max-width: 1024px) 20vw, 11rem"
              className="object-cover"
              onError={handleImageError}
            />
          </div>
          {!hasModifiers ? (
            <div className="absolute bottom-1 right-1">{quickAddButton}</div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
