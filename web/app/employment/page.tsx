"use client";

import { StoreHoursBanners } from "@/app/_client/store-hours-banners";
import { SiteHeader } from "@/components/site/site-header";
import { SitePageShell } from "@/components/site/site-page-shell";
import { getAppStrings } from "@/lib/i18n";
import { useLanguage } from "@/lib/language-context";
import { STORE_INFO } from "@/lib/site/store-info";

function embeddedEmploymentFormUrl(sourceUrl: string): string {
  if (sourceUrl.includes("embedded=true")) return sourceUrl;
  const separator = sourceUrl.includes("?") ? "&" : "?";
  return `${sourceUrl}${separator}embedded=true`;
}

export default function EmploymentPage() {
  const { language } = useLanguage();
  const copy = getAppStrings(language);
  const embeddedFormUrl = embeddedEmploymentFormUrl(STORE_INFO.employmentFormUrl);

  return (
    <>
      <SiteHeader />
      <StoreHoursBanners />
      <SitePageShell title={copy.employmentTitle} description={copy.employmentIntro}>
        <section className="rounded-xl border border-white/10 bg-[#0c2340]/60 p-5">
          <a
            href={STORE_INFO.employmentFormUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex rounded-xl bg-[#f4c430] px-5 py-3 font-semibold text-[#0c2340] shadow-lg hover:brightness-95"
          >
            {copy.applyNowCta}
          </a>
          <p className="mt-3 text-sm text-white/70">{copy.employmentEmbedHint}</p>
        </section>

        <section className="hidden overflow-hidden rounded-xl border border-white/10 bg-white md:block">
          <iframe
            title={copy.employmentFormEmbedTitle}
            src={embeddedFormUrl}
            className="h-[900px] w-full border-0"
            loading="lazy"
          />
        </section>
      </SitePageShell>
    </>
  );
}
