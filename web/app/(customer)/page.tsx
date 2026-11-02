"use client";

import { getAppStrings } from "@/lib/i18n";
import { useLanguage } from "@/lib/language-context";
import { ORDERING_PATH } from "@/lib/navigation/routes";
import Link from "next/link";

export default function LandingPage() {
  const { language } = useLanguage();
  const copy = getAppStrings(language);
  return (
    <>
      <main className="site-container px-4 py-20 text-center md:px-6 md:py-32">
        <h1 className="text-4xl font-extrabold tracking-tight md:text-5xl">{copy.landingTitle}</h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-muted">{copy.landingDescription}</p>
        <Link href={ORDERING_PATH} prefetch={false} className="mt-8 inline-flex rounded-lg bg-accent px-6 py-3 font-semibold text-white hover:brightness-95">
          {copy.navOrderOnline}
        </Link>
        <nav className="mt-8 flex justify-center gap-6" aria-label={copy.siteMenuLabel}>
          <Link href="/find-us" className="text-accent hover:underline">{copy.navFindUs}</Link>
          <Link href="/employment" className="text-accent hover:underline">{copy.navEmployment}</Link>
        </nav>
      </main>
    </>
  );
}
