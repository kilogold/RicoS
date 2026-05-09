"use client";

import type { CartLine } from "@/lib/cart-context";
import { getAppStrings } from "@/lib/i18n";
import { useLanguage } from "@/lib/language-context";
import { useMenuRuntime } from "@/lib/menu-runtime-context";
import { formatUsd, lineTotalCents, linesWithItems } from "@/lib/pricing";

export function CheckoutOrderSummary({ lines }: { lines: CartLine[] }) {
  const { language } = useLanguage();
  const { surface } = useMenuRuntime();
  const copy = getAppStrings(language);
  const summaryLines = linesWithItems(lines, surface);

  return (
    <div className="mb-6 rounded-xl border border-white/10 bg-black/20 p-4">
      <p className="text-sm font-semibold uppercase tracking-wide text-[#b8d4f0]">
        {copy.orderSummary}
      </p>
      <ul className="mt-3 space-y-2 text-sm text-white/85">
        {summaryLines.map(({ line, item }) => {
          const selections = surface.getSelectionDisplayLines(line.id, line.selections, language);
          return (
            <li
              key={`${line.id}-${JSON.stringify(line.selections)}`}
              className="rounded-md bg-white/5 px-3 py-2"
            >
              <p>
                {line.quantity}x {surface.resolveLocalizedText(item.name, language)} ·{" "}
                {formatUsd(lineTotalCents(line, surface), language)}
              </p>
              {selections.length > 0 ? (
                <p className="mt-1 text-xs text-[#b8d4f0]">{selections.join(" · ")}</p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
