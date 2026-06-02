"use client";

import { useCart } from "@/lib/cart-context";
import { getAppStrings } from "@/lib/i18n";
import { useLanguage } from "@/lib/language-context";
import { useMenuRuntime } from "@/lib/menu-runtime-context";
import { useStoreSession } from "@/app/_client/store-session-context";
import { formatUsd, lineTotalCents, subtotalCents } from "@/lib/pricing";
import {
  buildThemedMenuSections,
  formatThemeAvailabilityLabel,
  normalizeSelections,
  pruneInactiveSelections,
  selectionSignature,
  type LineSelections,
  type MenuCatalogSurface,
  type MenuCategory,
  type MenuDocument,
} from "@ricos/shared";
import { useStoreLocalNow } from "@/lib/use-store-local-now";
import Link from "next/link";
import { useMemo, useState } from "react";

function mergeRequiredSelectionDefaults(
  surface: MenuCatalogSurface,
  itemId: string,
  raw: LineSelections | undefined,
): LineSelections {
  const base = normalizeSelections(raw ?? {});
  const groups = surface.getActiveModifierGroupsForItem(itemId, base);
  const next: LineSelections = { ...base };
  for (const group of groups) {
    if (!group.required || group.options.length === 0) continue;
    const picked = [...(next[group.id] ?? [])];
    if (picked.length >= group.minSelections) continue;
    const pickedSet = new Set(picked);
    for (const opt of group.options) {
      if (picked.length >= group.minSelections) break;
      if (picked.length >= group.maxSelections) break;
      if (pickedSet.has(opt.id)) continue;
      picked.push(opt.id);
      pickedSet.add(opt.id);
    }
    next[group.id] = picked;
  }
  const allGroups = surface.getModifierGroupsForItem(itemId);
  return pruneInactiveSelections(allGroups, normalizeSelections(next));
}

function CategorySection({
  cat,
  surface,
  language,
  browseOnly,
  copy,
  linesByItem,
  getDraft,
  updateDraft,
  addItem,
  removeItem,
  setQuantity,
}: {
  cat: MenuCategory;
  surface: MenuCatalogSurface;
  language: "en" | "es";
  browseOnly: boolean;
  copy: ReturnType<typeof getAppStrings>;
  linesByItem: Map<string, ReturnType<typeof useCart>["lines"]>;
  getDraft: (itemId: string) => LineSelections;
  updateDraft: (itemId: string, next: LineSelections) => void;
  addItem: ReturnType<typeof useCart>["addItem"];
  removeItem: ReturnType<typeof useCart>["removeItem"];
  setQuantity: ReturnType<typeof useCart>["setQuantity"];
}) {
  return (
    <section key={cat.id} aria-labelledby={`cat-${cat.id}`} className="mt-10 first:mt-0">
      <div className="flex flex-wrap items-center gap-3">
        <h3
          id={`cat-${cat.id}`}
          className="inline-block rounded-md bg-[#c41e3a] px-4 py-1.5 text-lg font-bold uppercase tracking-wide text-white shadow-md"
        >
          {surface.resolveLocalizedText(cat.title, language)}
        </h3>
      </div>
      {cat.notes.length > 0 ? (
        <ul className="mt-3 space-y-1 text-sm text-[#b8d4f0]">
          {cat.notes.map((n) => (
            <li key={surface.resolveLocalizedText(n, "en")}>
              {surface.resolveLocalizedText(n, language)}
            </li>
          ))}
        </ul>
      ) : null}
      <ul className="mt-6 space-y-6">
        {cat.items.map((item) => {
          const modifierGroups = surface.getModifierGroupsForItem(item.id);
          const hasModifiers = modifierGroups.length > 0;
          const itemLines = linesByItem.get(item.id) ?? [];
          const draft = getDraft(item.id);
          const activeModifierGroups = surface.getActiveModifierGroupsForItem(item.id, draft);
          const plainLine = itemLines.find((line) => selectionSignature(line.selections) === "");
          const plainQty = plainLine?.quantity ?? 0;

          return (
            <li
              key={item.id}
              className="flex flex-col gap-3 border-b border-white/10 pb-6 last:border-0 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="max-w-2xl">
                <div className="flex flex-wrap items-baseline gap-2">
                  <h4 className="text-lg font-semibold text-white">
                    {surface.resolveLocalizedText(item.name, language)}
                  </h4>
                  <span className="text-[#f4c430]">{formatUsd(item.priceCents, language)}</span>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-white/70">
                  {surface.resolveLocalizedText(item.description, language)}
                </p>

                {modifierGroups.length > 0 ? (
                  <div className="mt-4 space-y-3 rounded-lg border border-white/10 bg-black/15 p-3">
                    {activeModifierGroups.map((group) => {
                      const picked = draft[group.id] ?? [];
                      return (
                        <div key={group.id}>
                          <p className="text-xs font-semibold uppercase tracking-wider text-[#b8d4f0]">
                            {surface.resolveLocalizedText(group.title, language)}
                            {group.required ? " *" : ""}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {group.options.map((option) => {
                              const checked = picked.includes(option.id);
                              const hasSurcharge = (option.priceDeltaCents ?? 0) > 0;
                              return (
                                <button
                                  key={option.id}
                                  type="button"
                                  disabled={browseOnly}
                                  aria-disabled={browseOnly}
                                  onClick={() => {
                                    const next = { ...draft };
                                    if (group.selectionType === "single") {
                                      next[group.id] = [option.id];
                                    } else {
                                      const current = new Set(next[group.id] ?? []);
                                      if (current.has(option.id)) current.delete(option.id);
                                      else if (current.size < group.maxSelections) {
                                        current.add(option.id);
                                      }
                                      next[group.id] = [...current];
                                    }
                                    updateDraft(item.id, next);
                                  }}
                                  className={`rounded-md border px-2 py-1 text-xs ${
                                    browseOnly ? "cursor-not-allowed opacity-45" : ""
                                  } ${
                                    checked
                                      ? "border-[#f4c430] bg-[#f4c430]/20 text-[#f4c430]"
                                      : "border-white/20 text-white/70 hover:bg-white/10"
                                  }`}
                                >
                                  {surface.resolveLocalizedText(option.label, language)}
                                  {hasSurcharge
                                    ? ` (+${formatUsd(option.priceDeltaCents ?? 0, language)})`
                                    : ""}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                {itemLines.length > 0 ? (
                  <ul className="mt-3 space-y-2 text-xs text-white/70">
                    {itemLines.map((line) => {
                      const signature = selectionSignature(line.selections);
                      const selectionRows = surface.getSelectionDisplayLines(
                        line.id,
                        line.selections,
                        language,
                      );
                      return (
                        <li
                          key={`${item.id}-${signature}`}
                          className="rounded-md border border-white/10 bg-black/10 px-3 py-2"
                        >
                          {selectionRows.length > 0 ? (
                            <p className="mb-1 text-[#b8d4f0]">{selectionRows.join(" · ")}</p>
                          ) : (
                            <p className="mb-1 text-[#b8d4f0]">{copy.defaultPrep}</p>
                          )}
                          <div className="flex items-center gap-2">
                            <span className="mr-2 font-semibold text-white">
                              {formatUsd(lineTotalCents(line, surface), language)}
                            </span>
                            <button
                              type="button"
                              disabled={browseOnly}
                              aria-disabled={browseOnly}
                              onClick={() =>
                                setQuantity(line.id, line.selections, line.quantity - 1)
                              }
                              className="h-7 w-7 rounded border border-white/20 text-sm text-white disabled:cursor-not-allowed disabled:opacity-40"
                              aria-label={`${copy.decreaseItemAria} ${surface.resolveLocalizedText(item.name, language)}`}
                            >
                              −
                            </button>
                            <span className="font-mono text-white">{line.quantity}</span>
                            <button
                              type="button"
                              disabled={browseOnly}
                              aria-disabled={browseOnly}
                              onClick={() =>
                                setQuantity(line.id, line.selections, line.quantity + 1)
                              }
                              className="h-7 w-7 rounded border border-white/20 text-sm text-white disabled:cursor-not-allowed disabled:opacity-40"
                              aria-label={`${copy.increaseItemAria} ${surface.resolveLocalizedText(item.name, language)}`}
                            >
                              +
                            </button>
                            <button
                              type="button"
                              disabled={browseOnly}
                              aria-disabled={browseOnly}
                              onClick={() => removeItem(line.id, line.selections)}
                              className="ml-2 text-red-300 hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline"
                            >
                              {copy.remove}
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {!hasModifiers ? (
                  plainQty > 0 ? (
                    <>
                      <button
                        type="button"
                        disabled={browseOnly}
                        aria-disabled={browseOnly}
                        onClick={() => setQuantity(item.id, {}, plainQty - 1)}
                        className="h-10 w-10 rounded-lg border border-white/20 text-lg font-medium text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                        aria-label={`${copy.decreaseItemAria} ${surface.resolveLocalizedText(item.name, language)}`}
                      >
                        −
                      </button>
                      <span className="w-8 text-center font-mono text-white">{plainQty}</span>
                      <button
                        type="button"
                        disabled={browseOnly}
                        aria-disabled={browseOnly}
                        onClick={() => setQuantity(item.id, {}, plainQty + 1)}
                        className="h-10 w-10 rounded-lg border border-white/20 text-lg font-medium text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                        aria-label={`${copy.increaseItemAria} ${surface.resolveLocalizedText(item.name, language)}`}
                      >
                        +
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={browseOnly}
                      aria-disabled={browseOnly}
                      onClick={() => addItem(item.id, {})}
                      className="rounded-lg bg-[#f4c430] px-4 py-2 text-sm font-semibold text-[#0c2340] shadow hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:brightness-100"
                    >
                      {copy.add}
                    </button>
                  )
                ) : (
                  <button
                    type="button"
                    disabled={browseOnly}
                    aria-disabled={browseOnly}
                    onClick={() => {
                      const validation = surface.validateSelectionsForItem(item.id, draft);
                      if (!validation.ok) return;
                      addItem(item.id, validation.normalized);
                    }}
                    className="rounded-lg bg-[#f4c430] px-4 py-2 text-sm font-semibold text-[#0c2340] shadow hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:brightness-100"
                  >
                    {copy.addConfigured}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function MenuBoard({ catalog }: { catalog: MenuDocument }) {
  const { lines, addItem, removeItem, setQuantity } = useCart();
  const { language } = useLanguage();
  const { surface } = useMenuRuntime();
  const { shoppingEnabled } = useStoreSession();
  const browseOnly = !shoppingEnabled;
  const copy = getAppStrings(language);
  const [draftSelections, setDraftSelections] = useState<
    Record<string, LineSelections>
  >({});

  const now = useStoreLocalNow();
  const themedSections = useMemo(
    () => buildThemedMenuSections(catalog, { now }),
    [catalog, now],
  );

  const linesByItem = useMemo(() => {
    const map = new Map<string, typeof lines>();
    for (const line of lines) {
      const list = map.get(line.id);
      if (list) list.push(line);
      else map.set(line.id, [line]);
    }
    return map;
  }, [lines]);

  const getDraft = (itemId: string): LineSelections =>
    mergeRequiredSelectionDefaults(surface, itemId, draftSelections[itemId]);

  const updateDraft = (itemId: string, next: LineSelections) => {
    const groups = surface.getModifierGroupsForItem(itemId);
    const pruned = pruneInactiveSelections(groups, normalizeSelections(next));
    setDraftSelections((prev) => ({ ...prev, [itemId]: pruned }));
  };

  const categorySectionProps = {
    surface,
    language,
    browseOnly,
    copy,
    linesByItem,
    getDraft,
    updateDraft,
    addItem,
    removeItem,
    setQuantity,
  };

  return (
    <div className="space-y-16">
      {themedSections.map(({ theme, categories, scheduleActive }) => {
        const themeBrowseOnly = browseOnly || !scheduleActive;
        const availability = catalog.themeAvailability?.[theme];
        const scheduleLabel =
          availability !== undefined
            ? formatThemeAvailabilityLabel(availability, language)
            : null;

        return (
          <section key={theme} aria-labelledby={`theme-${theme}`} className="space-y-2">
            <h2
              id={`theme-${theme}`}
              className="text-2xl font-extrabold uppercase tracking-[0.2em] text-[#f4c430] md:text-3xl"
            >
              {theme}
            </h2>
            {!scheduleActive && scheduleLabel ? (
              <p
                className="rounded-lg border border-amber-400/40 bg-amber-950/40 px-4 py-3 text-sm text-amber-100"
                role="status"
              >
                {copy.themeScheduleUnavailable}{" "}
                <span className="font-medium text-amber-50">
                  {copy.themeScheduleAvailableWhen} {scheduleLabel}
                </span>
              </p>
            ) : null}
            {categories.map((cat) => (
              <CategorySection
                key={cat.id}
                cat={cat}
                {...categorySectionProps}
                browseOnly={themeBrowseOnly}
              />
            ))}
          </section>
        );
      })}
    </div>
  );
}

export function CartBar() {
  const { lines } = useCart();
  const { language } = useLanguage();
  const { surface } = useMenuRuntime();
  const { shoppingEnabled } = useStoreSession();
  const copy = getAppStrings(language);
  const sum = subtotalCents(lines, surface);
  const count = lines.reduce((a, l) => a + l.quantity, 0);

  if (!shoppingEnabled) return null;
  if (count === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-[#07182b]/95 px-4 py-4 shadow-[0_-8px_30px_rgba(0,0,0,0.35)] backdrop-blur md:px-8">
      <div className="mx-auto flex max-w-4xl flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
        <p className="text-white/90">
          <span className="font-semibold text-[#f4c430]">{count}</span>{" "}
          {count === 1 ? copy.cartItemSingular : copy.cartItemPlural} ·{" "}
          <span className="font-semibold text-white">{formatUsd(sum, language)}</span>
        </p>
        <Link
          href="/checkout"
          className="inline-flex justify-center rounded-xl bg-[#f4c430] px-6 py-3 text-center font-semibold text-[#0c2340] shadow-lg hover:brightness-95"
        >
          {copy.checkout}
        </Link>
      </div>
    </div>
  );
}
