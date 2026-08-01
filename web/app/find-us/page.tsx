"use client";

import { StoreHoursBanners } from "@/app/_client/store-hours-banners";
import { SiteHeader } from "@/components/site/site-header";
import { SitePageShell } from "@/components/site/site-page-shell";
import { getAppStrings } from "@/lib/i18n";
import { useLanguage } from "@/lib/language-context";
import { STORE_INFO, formatStoreHoursLines } from "@/lib/site/store-info";
import { FaFacebookF, FaInstagram } from "react-icons/fa";

function SocialIconLinks() {
  return (
    <div className="flex items-center gap-3">
      <a
        href={STORE_INFO.instagramUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-foreground/15 text-foreground hover:bg-foreground/5"
        aria-label="Instagram"
      >
        <FaInstagram aria-hidden className="h-5 w-5" />
      </a>
      <a
        href={STORE_INFO.facebookUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-foreground/15 text-foreground hover:bg-foreground/5"
        aria-label="Facebook"
      >
        <FaFacebookF aria-hidden className="h-5 w-5" />
      </a>
    </div>
  );
}

export default function FindUsPage() {
  const { language } = useLanguage();
  const copy = getAppStrings(language);
  const hoursLines = formatStoreHoursLines(language);

  return (
    <>
      <SiteHeader />
      <StoreHoursBanners />
      <SitePageShell title={copy.findUsTitle} description={copy.findUsIntro}>
        <section className="overflow-hidden rounded-xl border border-foreground/10 bg-surface">
          <div className="h-56 w-full sm:h-72 md:h-80">
            <iframe
              title={copy.findUsMapHeading}
              src={STORE_INFO.googleMapsEmbedUrl}
              className="h-full w-full border-0"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <article className="rounded-xl border border-foreground/10 bg-surface p-5">
            <h2 className="text-lg font-semibold text-accent">{copy.findUsAddressHeading}</h2>
            <address className="mt-3 space-y-1 text-sm not-italic text-foreground/85">
              {STORE_INFO.addressLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </address>
            <a
              href={STORE_INFO.googleMapsDirectionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:brightness-95"
            >
              {copy.getDirections}
            </a>
          </article>

          <article className="rounded-xl border border-foreground/10 bg-surface p-5">
            <h2 className="text-lg font-semibold text-accent">{copy.findUsPhoneHeading}</h2>
            <a
              href={`tel:${STORE_INFO.phoneDial}`}
              className="mt-3 inline-flex text-base text-foreground/90 hover:text-accent"
            >
              {STORE_INFO.phoneDisplay}
            </a>
            <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-muted">
              {copy.followUs}
            </h3>
            <div className="mt-3">
              <SocialIconLinks />
            </div>
          </article>
        </section>

        <section className="rounded-xl border border-foreground/10 bg-surface p-5">
          <h2 className="text-lg font-semibold text-accent">{copy.hoursHeading}</h2>
          <div className="mt-3 space-y-1 text-sm text-foreground/85">
            {hoursLines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </section>
      </SitePageShell>
    </>
  );
}
