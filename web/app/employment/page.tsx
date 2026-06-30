"use client";

import { StoreHoursBanners } from "@/app/_client/store-hours-banners";
import { EmploymentApplicationForm } from "@/components/employment/employment-application-form";
import { SiteHeader } from "@/components/site/site-header";
import { SitePageShell } from "@/components/site/site-page-shell";
import { getAppStrings } from "@/lib/i18n";
import { useLanguage } from "@/lib/language-context";

export default function EmploymentPage() {
  const { language } = useLanguage();
  const copy = getAppStrings(language);

  return (
    <>
      <SiteHeader />
      <StoreHoursBanners />
      <SitePageShell title={copy.employmentTitle} description={copy.employmentIntro}>
        <EmploymentApplicationForm />
      </SitePageShell>
    </>
  );
}
