"use client";

import { StoreHoursBanners } from "@/app/_client/store-hours-banners";
import { EmploymentApplicationForm } from "@/components/employment/employment-application-form";
import { SitePageShell } from "@/components/site/site-page-shell";
import { getAppStrings } from "@/lib/i18n";
import { useLanguage } from "@/lib/language-context";

export default function EmploymentPage() {
  const { language } = useLanguage();
  const copy = getAppStrings(language);

  return (
    <>
      <StoreHoursBanners />
      <SitePageShell title={copy.employmentTitle} description={copy.employmentIntro}>
        <EmploymentApplicationForm />
      </SitePageShell>
    </>
  );
}
