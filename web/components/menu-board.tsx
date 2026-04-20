"use client";

import { useCart } from "@/lib/cart-context";
import { formatUsd, totalCents } from "@/lib/pricing";
import type { MenuCategory } from "@ricos/shared";
import Link from "next/link";

export function MenuBoard({ categories }: { categories: MenuCategory[] }) {
  const { lines, addItem, setQuantity } = useCart();

  const qtyFor = (id: string) => lines.find((l) => l.id === id)?.quantity ?? 0;

  return (
    <div className="space-y-14">
      {categories.map((cat) => (
        <section key={cat.id} aria-labelledby={`cat-${cat.id}`}>
          <div className="flex flex-wrap items-center gap-3">
            <h2
              id={`cat-${cat.id}`}
              className="inline-block rounded-md bg-[#c41e3a] px-4 py-1.5 text-lg font-bold uppercase tracking-wide text-white shadow-md"
            >
              {cat.title}
            </h2>
          </div>
          {cat.notes.length > 0 ? (
            <ul className="mt-3 space-y-1 text-sm text-[#b8d4f0]">
              {cat.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          ) : null}
          <ul className="mt-6 space-y-6">
            {cat.items.map((item) => {
              const q = qtyFor(item.id);
              return (
                <li
                  key={item.id}
                  className="flex flex-col gap-3 border-b border-white/10 pb-6 last:border-0 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="max-w-2xl">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <h3 className="text-lg font-semibold text-white">
                        {item.name}
                      </h3>
                      <span className="text-[#f4c430]">
                        {formatUsd(item.priceCents)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-white/70">
                      {item.description}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {q > 0 ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setQuantity(item.id, q - 1)}
                          className="h-10 w-10 rounded-lg border border-white/20 text-lg font-medium text-white hover:bg-white/10"
                          aria-label={`Decrease ${item.name}`}
                        >
                          −
                        </button>
                        <span className="w-8 text-center font-mono text-white">
                          {q}
                        </span>
                        <button
                          type="button"
                          onClick={() => setQuantity(item.id, q + 1)}
                          className="h-10 w-10 rounded-lg border border-white/20 text-lg font-medium text-white hover:bg-white/10"
                          aria-label={`Increase ${item.name}`}
                        >
                          +
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => addItem(item.id)}
                        className="rounded-lg bg-[#f4c430] px-4 py-2 text-sm font-semibold text-[#0c2340] shadow hover:brightness-95"
                      >
                        Add
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function CartBar() {
  const { lines } = useCart();
  const sum = totalCents(lines);
  const count = lines.reduce((a, l) => a + l.quantity, 0);

  if (count === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-[#07182b]/95 px-4 py-4 shadow-[0_-8px_30px_rgba(0,0,0,0.35)] backdrop-blur md:px-8">
      <div className="mx-auto flex max-w-4xl flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
        <p className="text-white/90">
          <span className="font-semibold text-[#f4c430]">{count}</span>{" "}
          {count === 1 ? "item" : "items"} ·{" "}
          <span className="font-semibold text-white">{formatUsd(sum)}</span>
        </p>
        <Link
          href="/checkout"
          className="inline-flex justify-center rounded-xl bg-[#f4c430] px-6 py-3 text-center font-semibold text-[#0c2340] shadow-lg hover:brightness-95"
        >
          Checkout
        </Link>
      </div>
    </div>
  );
}
