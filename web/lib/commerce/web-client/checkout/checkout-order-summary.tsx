"use client";

import type { CartLine } from "@/lib/commerce/web-client/cart/cart-context";
import { formatUsd, lineTotalCents, linesWithItems } from "@/lib/commerce/web-client/cart/pricing";
import { getAppStrings, useLanguage } from "@/lib/shared/i18n";
import { getSelectionDisplayLines, resolveLocalizedText } from "@ricos/shared";

export function CheckoutOrderSummary({ lines }: { lines: CartLine[] }) {
  const { language } = useLanguage();
  const copy = getAppStrings(language);
  const summaryLines = linesWithItems(lines);

  return (
    <div className="mb-6 rounded-xl border border-white/10 bg-black/20 p-4">
      <p className="text-sm font-semibold uppercase tracking-wide text-[#b8d4f0]">
        {copy.orderSummary}
      </p>
      <ul className="mt-3 space-y-2 text-sm text-white/85">
        {summaryLines.map(({ line, item }) => {
          const selections = getSelectionDisplayLines(line.id, line.selections, language);
          return (
            <li
              key={`${line.id}-${JSON.stringify(line.selections)}`}
              className="rounded-md bg-white/5 px-3 py-2"
            >
              <p>
                {line.quantity}x {resolveLocalizedText(item.name, language)} ·{" "}
                {formatUsd(lineTotalCents(line), language)}
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
