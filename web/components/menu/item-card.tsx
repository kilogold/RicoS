"use client";

import { getAppStrings } from "@/lib/i18n";
import { formatUsd } from "@/lib/pricing";
import type { Language, MenuCatalogSurface, MenuItem } from "@ricos/shared";
import type { MouseEvent } from "react";

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

  const handleCardClick = () => {
    if (browseOnly) return;
    if (hasModifiers) onOpenModal();
  };

  const handleQuickAdd = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (browseOnly) return;
    onQuickAdd();
  };

  return (
    <article
      className={`group relative flex h-full flex-col rounded-xl border border-white/10 bg-surface p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-md ${
        hasModifiers && !browseOnly ? "cursor-pointer" : ""
      } ${browseOnly ? "opacity-60" : ""}`}
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
      <div className="flex items-start justify-between gap-3">
        <h4 className="text-base font-semibold leading-snug text-white">{name}</h4>
        {!hasModifiers ? (
          <button
            type="button"
            disabled={browseOnly}
            aria-disabled={browseOnly}
            onClick={handleQuickAdd}
            aria-label={`${copy.quickAddAria}: ${name}`}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-lg font-bold text-surface shadow transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-45"
          >
            +
          </button>
        ) : (
          <span className="shrink-0 rounded-md border border-accent/40 bg-accent/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-accent">
            {copy.customize}
          </span>
        )}
      </div>
      <p className="mt-2 line-clamp-2 flex-1 text-sm leading-relaxed text-white/70">{description}</p>
      <p className="mt-3 text-sm font-semibold text-accent">{priceLabel}</p>
    </article>
  );
}
