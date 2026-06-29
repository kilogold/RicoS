"use client";

import { SiteNavDrawer } from "@/components/site/site-nav-drawer";
import { getAppStrings } from "@/lib/i18n";
import { useLanguage } from "@/lib/language-context";
import Link from "next/link";
import { useState } from "react";

export function SiteHeader() {
  const { language, setLanguage } = useLanguage();
  const copy = getAppStrings(language);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#07182b]/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 md:px-6">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-3 py-2 text-sm font-medium text-white/90 hover:bg-white/10"
            aria-label={copy.siteMenuLabel}
          >
            <span className="text-base leading-none">☰</span>
            {copy.siteMenuLabel}
          </button>
          <Link href="/" className="text-lg font-bold tracking-wide text-[#f4c430]">
            RicoS
          </Link>
          <div className="inline-flex items-center gap-1 rounded-lg border border-white/20 bg-black/20 p-1">
            <button
              type="button"
              onClick={() => setLanguage("es")}
              className={`rounded px-2 py-1 text-xs ${
                language === "es" ? "bg-accent text-surface" : "text-white/75 hover:bg-white/10"
              }`}
            >
              {copy.spanishLabel}
            </button>
            <button
              type="button"
              onClick={() => setLanguage("en")}
              className={`rounded px-2 py-1 text-xs ${
                language === "en" ? "bg-accent text-surface" : "text-white/75 hover:bg-white/10"
              }`}
            >
              {copy.englishLabel}
            </button>
          </div>
        </div>
      </header>
      <SiteNavDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}
