"use client";

import { useCart } from "@/lib/cart-context";
import { getAppStrings } from "@/lib/i18n";
import { useLanguage } from "@/lib/language-context";
import { useMenuRuntime } from "@/lib/menu-runtime-context";
import { useStoreSession } from "@/app/_client/store-session-context";
import { formatUsd, lineTotalCents, subtotalCents } from "@/lib/pricing";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type CartDrawerProps = {
  open: boolean;
  onClose: () => void;
};

export function FloatingCartButton({
  onOpen,
  hidden = false,
}: {
  onOpen: () => void;
  hidden?: boolean;
}) {
  const { lines } = useCart();
  const { language } = useLanguage();
  const { surface } = useMenuRuntime();
  const { shoppingEnabled } = useStoreSession();
  const copy = getAppStrings(language);
  const count = lines.reduce((sum, line) => sum + line.quantity, 0);
  const sum = subtotalCents(lines, surface);

  const [anim, setAnim] = useState<"in" | "pop" | null>(null);
  const previousCount = useRef(count);

  useEffect(() => {
    const previous = previousCount.current;
    previousCount.current = count;
    if (count < 1) {
      setAnim(null);
      return;
    }
    // First appearance (0 -> N) slides in; later additions grow/shrink.
    // Exactly one phase is active at a time so the effects never stack.
    let next: "in" | "pop" | null = null;
    if (previous < 1) next = "in";
    else if (count > previous) next = "pop";
    if (!next) return;
    setAnim(next);
    const timeout = setTimeout(() => setAnim(null), 400);
    return () => clearTimeout(timeout);
  }, [count]);

  if (!shoppingEnabled || hidden || count < 1) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:justify-end sm:px-0">
      <button
        type="button"
        onClick={onOpen}
        aria-label={copy.viewCart}
        className={`pointer-events-auto flex w-full max-w-sm items-center justify-between gap-3 rounded-2xl bg-accent px-5 py-3.5 font-semibold text-surface shadow-[0_10px_30px_rgba(0,0,0,0.45)] ring-1 ring-black/10 transition hover:brightness-95 sm:w-auto ${
          anim === "in" ? "animate-cart-in" : anim === "pop" ? "animate-cart-pop" : ""
        }`}
      >
        <span className="flex items-center gap-2.5">
          <span className="relative flex items-center" aria-hidden>
            <span className="text-lg leading-none">🛒</span>
            <span className="absolute -right-2.5 -top-2.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-category px-1 text-xs font-bold text-white">
              {count}
            </span>
          </span>
          <span>{copy.viewCart}</span>
        </span>
        <span className="tabular-nums">{formatUsd(sum, language)}</span>
      </button>
    </div>
  );
}

export function CartDrawer({ open, onClose }: CartDrawerProps) {
  const { lines, removeItem, setQuantity } = useCart();
  const { language } = useLanguage();
  const { surface } = useMenuRuntime();
  const { shoppingEnabled } = useStoreSession();
  const copy = getAppStrings(language);
  const sum = subtotalCents(lines, surface);
  const count = lines.reduce((total, line) => total + line.quantity, 0);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open || !shoppingEnabled) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label={copy.closeModal}
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-drawer-title"
        className="relative flex h-full w-full max-w-md flex-col border-l border-white/10 bg-surface shadow-2xl sm:max-w-sm"
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 id="cart-drawer-title" className="text-lg font-bold text-white">
            {copy.cartDrawerTitle}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={copy.closeModal}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 text-white/70 hover:bg-white/10"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {count === 0 ? (
            <p className="py-8 text-center text-sm text-white/60">{copy.emptyCart}</p>
          ) : (
            <ul className="space-y-4">
              {lines.map((line) => {
                const item = surface.getItemById(line.id);
                if (!item) return null;
                const name = surface.resolveLocalizedText(item.name, language);
                const selectionRows = surface.getSelectionDisplayLines(
                  line.id,
                  line.selections,
                  language,
                );
                const lineKey = `${line.id}-${JSON.stringify(line.selections)}`;

                return (
                  <li
                    key={lineKey}
                    className="rounded-lg border border-white/10 bg-black/15 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-white">{name}</p>
                        {selectionRows.length > 0 ? (
                          <p className="mt-1 text-xs text-muted">{selectionRows.join(" · ")}</p>
                        ) : null}
                        <p className="mt-1 text-sm font-medium text-accent">
                          {formatUsd(lineTotalCents(line, surface), language)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(line.id, line.selections)}
                        aria-label={`${copy.remove} ${name}`}
                        className="shrink-0 text-xs text-red-300 hover:underline"
                      >
                        {copy.remove}
                      </button>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setQuantity(line.id, line.selections, line.quantity - 1)}
                        aria-label={`${copy.decreaseItemAria} ${name}`}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/20 text-white hover:bg-white/10"
                      >
                        −
                      </button>
                      <span className="w-6 text-center font-mono text-sm text-white">
                        {line.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => setQuantity(line.id, line.selections, line.quantity + 1)}
                        aria-label={`${copy.increaseItemAria} ${name}`}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/20 text-white hover:bg-white/10"
                      >
                        +
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="shrink-0 border-t border-white/10 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))]">
          <div className="mb-3 flex items-center justify-between text-sm">
            <span className="text-white/70">{copy.subtotalLabel}</span>
            <span className="font-semibold text-white">{formatUsd(sum, language)}</span>
          </div>
          {count > 0 ? (
            <Link
              href="/checkout"
              onClick={onClose}
              className="block w-full rounded-xl bg-accent py-3.5 text-center font-semibold text-surface shadow-lg transition hover:brightness-95"
            >
              {copy.checkout}
            </Link>
          ) : (
            <button
              type="button"
              disabled
              className="block w-full cursor-not-allowed rounded-xl bg-accent/40 py-3.5 text-center font-semibold text-surface/60"
            >
              {copy.checkout}
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}
