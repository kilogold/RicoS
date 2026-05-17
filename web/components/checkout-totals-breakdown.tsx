"use client";

import type { OrderTotals } from "@ricos/shared";
import { getAppStrings } from "@/lib/i18n";
import { useLanguage } from "@/lib/language-context";
import { formatUsd } from "@/lib/pricing";

export function CheckoutTotalsBreakdown({ totals }: { totals: OrderTotals }) {
  const { language } = useLanguage();
  const copy = getAppStrings(language);

  const rows: { label: string; cents: number; emphasize?: boolean }[] = [
    { label: copy.subtotalLabel, cents: totals.subtotalCents },
    { label: copy.serviceChargeLabel, cents: totals.serviceChargeCents },
    { label: copy.salesTaxLabel, cents: totals.salesTaxCents },
    { label: copy.municipalTaxLabel, cents: totals.municipalTaxCents },
    { label: copy.grandTotalLabel, cents: totals.grandTotalCents, emphasize: true },
  ];

  return (
    <dl className="mt-4 space-y-2 border-t border-white/10 pt-4 text-sm">
      {rows.map(({ label, cents, emphasize }) => (
        <div
          key={label}
          className={`flex items-baseline justify-between gap-4 ${
            emphasize ? "text-base font-semibold text-white" : "text-white/85"
          }`}
        >
          <dt>{label}</dt>
          <dd className={emphasize ? "text-[#f4c430]" : undefined}>{formatUsd(cents, language)}</dd>
        </div>
      ))}
    </dl>
  );
}
