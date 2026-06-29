"use client";

import { useCart } from "@/lib/cart-context";
import { getAppStrings } from "@/lib/i18n";
import { useLanguage } from "@/lib/language-context";
import { useMenuRuntime } from "@/lib/menu-runtime-context";
import { formatUsd } from "@/lib/pricing";
import type { LineSelections, MenuItem } from "@ricos/shared";
import { useEffect, useRef, useState } from "react";
import { mergeRequiredSelectionDefaults, pruneDraftSelections } from "./modifier-draft";

type ItemModalProps = {
  item: MenuItem;
  browseOnly: boolean;
  onClose: () => void;
};

export function ItemModal({ item, browseOnly, onClose }: ItemModalProps) {
  const { addItem, setQuantity } = useCart();
  const { language } = useLanguage();
  const { surface } = useMenuRuntime();
  const copy = getAppStrings(language);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<LineSelections>(() =>
    mergeRequiredSelectionDefaults(surface, item.id, {}),
  );
  const [qty, setQty] = useState(1);

  const activeModifierGroups = surface.getActiveModifierGroupsForItem(item.id, draft);
  const validation = surface.validateSelectionsForItem(item.id, draft);
  const unitCents = surface.getLineUnitPriceCents(item.id, validation.ok ? validation.normalized : draft) ?? item.priceCents;
  const totalCents = unitCents * qty;
  const canAdd = validation.ok && !browseOnly;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusable = dialog.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    first?.focus();

    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || focusable.length === 0) return;
      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        }
      } else if (document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    dialog.addEventListener("keydown", trapFocus);
    return () => dialog.removeEventListener("keydown", trapFocus);
  }, []);

  const updateDraft = (next: LineSelections) => {
    setDraft(pruneDraftSelections(surface, item.id, next));
  };

  const handleAdd = () => {
    if (!validation.ok) return;
    addItem(item.id, validation.normalized);
    if (qty > 1) {
      setQuantity(item.id, validation.normalized, qty);
    }
    onClose();
  };

  const name = surface.resolveLocalizedText(item.name, language);
  const description = surface.resolveLocalizedText(item.description, language);

  const requiredLabel = (min: number, max: number) => {
    if (min === max) return copy.selectN.replace("{n}", String(min));
    return `${copy.selectN.replace("{n}", String(min))}–${max}`;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="item-modal-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-2xl border border-white/15 bg-surface shadow-2xl sm:max-h-[85vh] sm:rounded-2xl"
      >
        <div className="flex shrink-0 justify-center pt-3 pb-1 sm:hidden">
          <span className="h-1 w-10 rounded-full bg-white/20" aria-hidden />
        </div>

        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div>
            <h2 id="item-modal-title" className="text-xl font-bold text-white">
              {name}
            </h2>
            <p className="mt-1 text-sm font-semibold text-accent">
              {formatUsd(item.priceCents, language)}+
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={copy.closeModal}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/20 text-white/70 hover:bg-white/10"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          <p className="text-sm leading-relaxed text-white/70">{description}</p>

          {activeModifierGroups.length > 0 ? (
            <div className="mt-6 space-y-6">
              {activeModifierGroups.map((group) => {
                const picked = draft[group.id] ?? [];
                return (
                  <fieldset key={group.id} className="space-y-3">
                    <legend className="flex flex-wrap items-center gap-2 text-sm font-semibold text-white">
                      {surface.resolveLocalizedText(group.title, language)}
                      {group.required ? (
                        <span className="rounded bg-category/20 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-category">
                          {copy.requiredBadge} · {requiredLabel(group.minSelections, group.maxSelections)}
                        </span>
                      ) : null}
                    </legend>
                    <div className="space-y-2">
                      {group.options.map((option) => {
                        const checked = picked.includes(option.id);
                        const hasSurcharge = (option.priceDeltaCents ?? 0) > 0;
                        const inputType = group.selectionType === "single" ? "radio" : "checkbox";
                        return (
                          <label
                            key={option.id}
                            className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition ${
                              browseOnly ? "cursor-not-allowed opacity-45" : ""
                            } ${
                              checked
                                ? "border-accent bg-accent/10"
                                : "border-white/15 hover:border-white/25"
                            }`}
                          >
                            <input
                              type={inputType}
                              name={group.id}
                              checked={checked}
                              disabled={browseOnly}
                              onChange={() => {
                                const next = { ...draft };
                                if (group.selectionType === "single") {
                                  next[group.id] = [option.id];
                                } else {
                                  const current = new Set(next[group.id] ?? []);
                                  if (current.has(option.id)) current.delete(option.id);
                                  else if (current.size < group.maxSelections) current.add(option.id);
                                  next[group.id] = [...current];
                                }
                                updateDraft(next);
                              }}
                              className="h-4 w-4 accent-accent"
                            />
                            <span className="flex-1 text-sm text-white">
                              {surface.resolveLocalizedText(option.label, language)}
                            </span>
                            {hasSurcharge ? (
                              <span className="text-sm text-accent">
                                +{formatUsd(option.priceDeltaCents ?? 0, language)}
                              </span>
                            ) : null}
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                );
              })}
            </div>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-white/10 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))]">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm text-white/70">{copy.totalLabel}</span>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={browseOnly || qty <= 1}
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  aria-label={copy.decreaseItemAria}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/20 text-white disabled:opacity-40"
                >
                  −
                </button>
                <span className="w-6 text-center font-mono text-white">{qty}</span>
                <button
                  type="button"
                  disabled={browseOnly || qty >= 99}
                  onClick={() => setQty((q) => Math.min(99, q + 1))}
                  aria-label={copy.increaseItemAria}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/20 text-white disabled:opacity-40"
                >
                  +
                </button>
              </div>
              <span className="text-lg font-bold text-accent">{formatUsd(totalCents, language)}</span>
            </div>
          </div>
          <button
            type="button"
            disabled={!canAdd}
            onClick={handleAdd}
            className="w-full rounded-xl bg-accent py-3.5 text-center font-semibold text-surface shadow-lg transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {copy.addToCart} · {formatUsd(totalCents, language)}
          </button>
        </div>
      </div>
    </div>
  );
}
