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
      <header className="sticky top-0 z-40 border-b border-foreground/10 bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 md:px-6">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-white shadow-md shadow-accent/30 transition hover:brightness-95"
            aria-label={copy.siteMenuLabel}
          >
            <span className="text-xl leading-none" aria-hidden="true">☰</span>
          </button>
          <Link href="/" className="text-lg font-bold tracking-wide">
            <span className="text-foreground">Rico</span>
            <span className="text-accent">S</span>
          </Link>
          <div className="inline-flex items-center gap-1 rounded-lg border border-foreground/15 bg-background p-1">
            <button
              type="button"
              onClick={() => setLanguage("es")}
              className={`rounded px-2 py-1 text-xs ${
                language === "es" ? "bg-accent text-white" : "text-foreground/75 hover:bg-foreground/5"
              }`}
            >
              {copy.spanishLabel}
            </button>
            <button
              type="button"
              onClick={() => setLanguage("en")}
              className={`rounded px-2 py-1 text-xs ${
                language === "en" ? "bg-accent text-white" : "text-foreground/75 hover:bg-foreground/5"
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
